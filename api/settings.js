import { getDb } from '../lib/api/db.js';
import { readSettings } from '../lib/api/settings.js';
import { CAFES, HttpError, handler, kstToday, readBody } from '../lib/api/http.js';

export default handler({
  async GET(req, res) {
    const db = await getDb();
    return res.status(200).json(await readSettings(db, kstToday()));
  },

  async PUT(req, res) {
    const body = await readBody(req);
    const updates = [];

    if (body.today_cafe !== undefined) {
      if (!CAFES.includes(body.today_cafe)) {
        throw new HttpError(400, `today_cafe는 ${CAFES.join(', ')} 중 하나여야 합니다.`);
      }
      updates.push(['today_cafe', body.today_cafe]);
    }
    if (body.is_closed !== undefined) {
      if (typeof body.is_closed !== 'boolean') throw new HttpError(400, 'is_closed는 true/false여야 합니다.');
      // 마감은 날짜별 — 다음 날 자동으로 해제됨
      updates.push([`is_closed:${kstToday()}`, String(body.is_closed)]);
    }
    if (updates.length === 0) throw new HttpError(400, 'today_cafe 또는 is_closed 중 하나는 필요합니다.');

    const db = await getDb();
    await db.batch(
      updates.map(([key, value]) => ({
        sql: `INSERT INTO coffee_settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        args: [key, value],
      })),
      'write',
    );
    return res.status(200).json(await readSettings(db));
  },
});
