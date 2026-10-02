import { randomUUID } from 'node:crypto';
import { getDb } from '../../lib/api/db.js';
import { readSettings } from '../../lib/api/settings.js';
import {
  CAFES, TEMPS, HttpError, clientIp, handler, isDateString, kstToday, rateLimit, readBody, requireString,
} from '../../lib/api/http.js';

const toOrder = (row) => ({
  id: row.id,
  order_date: row.order_date,
  name: row.name,
  cafe: row.cafe,
  menu: row.menu,
  price: Number(row.price),
  temp: row.temp,
  note: row.note,
  created_at: row.created_at,
});

export default handler({
  async GET(req, res) {
    const date = req.query?.date ?? kstToday();
    if (!isDateString(date)) throw new HttpError(400, 'date는 YYYY-MM-DD 형식이어야 합니다.');
    const db = await getDb();
    const { rows } = await db.execute({
      sql: `SELECT id, order_date, name, cafe, menu, price, temp, note, created_at
            FROM coffee_orders WHERE order_date = ? ORDER BY created_at, rowid`,
      args: [date],
    });
    return res.status(200).json({ date, orders: rows.map(toOrder) });
  },

  async POST(req, res) {
    rateLimit(`orders:${clientIp(req)}`, 30, 60_000);
    const body = await readBody(req);

    const name = requireString(body, 'name', { max: 20 });
    const cafe = requireString(body, 'cafe', { max: 20 });
    const menu = requireString(body, 'menu', { max: 50 });
    const temp = requireString(body, 'temp');
    const note = requireString(body, 'note', { max: 100, required: false });
    const token = requireString(body, 'token', { max: 128, min: 16 });
    const { price } = body;

    if (!CAFES.includes(cafe)) throw new HttpError(400, `cafe는 ${CAFES.join(', ')} 중 하나여야 합니다.`);
    if (!TEMPS.includes(temp)) throw new HttpError(400, 'temp는 HOT 또는 ICE여야 합니다.');
    if (!Number.isSafeInteger(price) || price <= 0 || price > 100_000) {
      throw new HttpError(400, 'price는 양의 정수여야 합니다.');
    }

    const db = await getDb();
    const settings = await readSettings(db);
    if (settings.is_closed) throw new HttpError(409, '오늘 주문은 마감되었어요.');

    const order = {
      id: randomUUID(),
      order_date: kstToday(),
      name, cafe, menu, price, temp, note,
    };
    await db.execute({
      sql: `INSERT INTO coffee_orders (id, order_date, name, cafe, menu, price, temp, note, token)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [order.id, order.order_date, name, cafe, menu, price, temp, note, token],
    });
    return res.status(201).json({ order });
  },
});
