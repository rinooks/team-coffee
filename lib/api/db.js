import { createClient } from '@libsql/client';

// 서버리스 인스턴스당 하나의 클라이언트를 재사용한다.
let client = null;
let schemaReady = null;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS coffee_orders (
    id TEXT PRIMARY KEY,
    order_date TEXT NOT NULL,
    name TEXT NOT NULL,
    cafe TEXT NOT NULL,
    menu TEXT NOT NULL,
    price INTEGER NOT NULL,
    temp TEXT,
    note TEXT,
    token TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS coffee_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_orders_date ON coffee_orders(order_date)`,
];

export function getClient() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error('TURSO_DATABASE_URL 환경변수가 설정되지 않았습니다.');
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return client;
}

// schema.sql을 수동으로 적용하지 않았어도 동작하도록 콜드 스타트마다 한 번 보장한다.
export async function getDb() {
  const db = getClient();
  if (!schemaReady) {
    schemaReady = db.batch(SCHEMA, 'write').catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
  return db;
}
