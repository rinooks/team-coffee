CREATE TABLE IF NOT EXISTS coffee_orders (
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
);
CREATE TABLE IF NOT EXISTS coffee_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_date ON coffee_orders(order_date);
