import { CAFES, DEFAULT_SETTINGS, kstToday } from './http.js';

// is_closed는 날짜별(마감한 날에만 유효), today_cafe는 전역 설정
export async function readSettings(db, date = kstToday()) {
  const closedKey = `is_closed:${date}`;
  const { rows } = await db.execute(
    "SELECT key, value FROM coffee_settings WHERE key IN ('today_cafe', ?)",
    [closedKey],
  );
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key === 'today_cafe' && CAFES.includes(row.value)) settings.today_cafe = row.value;
    if (row.key === closedKey) settings.is_closed = row.value === 'true';
  }
  return settings;
}
