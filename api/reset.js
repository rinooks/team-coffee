import { getDb } from '../lib/api/db.js';
import { HttpError, handler, isDateString, kstToday, readBody } from '../lib/api/http.js';

export default handler({
  async POST(req, res) {
    const body = await readBody(req);
    const date = body.date ?? kstToday();
    if (!isDateString(date)) throw new HttpError(400, 'date는 YYYY-MM-DD 형식이어야 합니다.');

    const db = await getDb();
    const result = await db.execute({ sql: 'DELETE FROM coffee_orders WHERE order_date = ?', args: [date] });
    return res.status(200).json({ ok: true, date, deleted: result.rowsAffected });
  },
});
