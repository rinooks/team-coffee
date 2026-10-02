export const CAFES = ['메가커피', '컴포즈커피', '바나프레소'];
export const TEMPS = ['HOT', 'ICE'];
export const DEFAULT_SETTINGS = { today_cafe: '메가커피', is_closed: false };

export function kstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function isDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function readBody(req) {
  let body;
  try {
    body = req.body;
  } catch {
    throw new HttpError(400, '요청 본문이 올바른 JSON이 아닙니다.');
  }
  if (body === undefined || body === null || body === '') {
    // 런타임이 본문을 파싱하지 않은 경우 스트림에서 직접 읽는다.
    if (typeof req.on === 'function' && !req.readableEnded) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = Buffer.concat(chunks).toString('utf8');
    }
    if (!body) return {};
  }
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      throw new HttpError(400, '요청 본문이 올바른 JSON이 아닙니다.');
    }
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, '요청 본문은 JSON 객체여야 합니다.');
  }
  return body;
}

export function requireString(body, field, { max, required = true, min = 1 } = {}) {
  const value = body[field];
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, `${field} 값이 필요합니다.`);
    return null;
  }
  if (typeof value !== 'string') throw new HttpError(400, `${field}는 문자열이어야 합니다.`);
  const trimmed = value.trim();
  if (required && trimmed.length < min) throw new HttpError(400, `${field} 값이 너무 짧습니다.`);
  if (max && trimmed.length > max) throw new HttpError(400, `${field}는 ${max}자 이하여야 합니다.`);
  return trimmed || null;
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

// 인스턴스 메모리 기반 간단 rate limit (인스턴스가 여러 개면 인스턴스별로 따로 센다).
const buckets = new Map();
export function rateLimit(key, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (now - b.start >= windowMs) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.start >= windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) throw new HttpError(429, '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.');
}

export function handler(methods) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const fn = methods[req.method];
    if (!fn) {
      res.setHeader('Allow', Object.keys(methods).join(', '));
      return res.status(405).json({ error: '허용되지 않는 메서드입니다.' });
    }
    try {
      return await fn(req, res);
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      console.error(err);
      return res.status(500).json({ error: '서버 오류가 발생했어요.' });
    }
  };
}
