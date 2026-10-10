-- Run against the production PostgreSQL database before starting the app.
-- These statements are safe to rerun; the app's migrate() also applies them.
BEGIN;

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO app_settings (key, value)
VALUES ('telegram_support_contact', 'https://t.me/aiworkstation_support')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE users ADD COLUMN IF NOT EXISTS deposit_address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deposit_cryptocurrency TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deposit_network TEXT;

ALTER TABLE deposits ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS details JSONB;
ALTER TABLE deposits ALTER COLUMN method SET DEFAULT 'bank';
ALTER TABLE withdrawals ALTER COLUMN method SET DEFAULT 'bank';

INSERT INTO cryptocurrencies (code, name) VALUES
  ('USDT', 'Tether USD'),
  ('BTC', 'Bitcoin')
ON CONFLICT (code) DO NOTHING;

INSERT INTO blockchain_networks (code, name) VALUES
  ('TRC20', 'TRON'),
  ('ERC20', 'Ethereum'),
  ('BEP20', 'BNB Smart Chain'),
  ('BTC', 'Bitcoin')
ON CONFLICT (code) DO NOTHING;

INSERT INTO cryptocurrency_networks (cryptocurrency, network) VALUES
  ('USDT', 'TRC20'),
  ('USDT', 'ERC20'),
  ('USDT', 'BEP20'),
  ('BTC', 'BTC')
ON CONFLICT DO NOTHING;

COMMIT;
