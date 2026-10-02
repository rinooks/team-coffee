import { timingSafeEqual } from 'node:crypto';
import { getDb } from '../../lib/api/db.js';
import { HttpError, handler, readBody, requireString } from '../../lib/api/http.js';

function sameToken(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export default handler({
  async DELETE(req, res) {
    const id = req.query?.id;
    if (typeof id !== 'string' || !id || id.length > 64) throw new HttpError(400, '주문 id가 올바르지 않습니다.');
    const body = await readBody(req);
    const token = requireString(body, 'token', { max: 128 });

    const db = await getDb();
    const { rows } = await db.execute({ sql: 'SELECT token FROM coffee_orders WHERE id = ?', args: [id] });
    if (rows.length === 0) throw new HttpError(404, '주문을 찾을 수 없어요.');
    if (!sameToken(rows[0].token, token)) throw new HttpError(403, '본인 주문만 삭제할 수 있어요.');

    await db.execute({ sql: 'DELETE FROM coffee_orders WHERE id = ?', args: [id] });
    return res.status(200).json({ ok: true, id });
  },
});
