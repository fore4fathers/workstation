import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../db.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const schema = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
  await query(schema);

  await query(`
    ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS pending NUMERIC(12,2) NOT NULL DEFAULT 0
  `);
  await query(`
    ALTER TABLE assignments
      ADD COLUMN IF NOT EXISTS payout_status TEXT NOT NULL DEFAULT 'pending'
  `);

  await query(`ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_payout_status_check`);
  await query(`
    ALTER TABLE assignments ADD CONSTRAINT assignments_payout_status_check
      CHECK (payout_status IN ('none','pending','released','voided'))
  `);

  await query(`ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_pending_check`);
  await query(`
    ALTER TABLE accounts ADD CONSTRAINT accounts_pending_check CHECK (pending >= 0)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_assignments_payout
      ON assignments(payout_status) WHERE status = 'submitted'
  `);

  await query(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS payout_amount NUMERIC(12,2) NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMPTZ`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tier INTEGER NOT NULL DEFAULT 2`);
  await query(`ALTER TABLE users ALTER COLUMN tier SET DEFAULT 2`);
  await query(`CREATE TABLE IF NOT EXISTS schema_flags (key TEXT PRIMARY KEY)`);
  const { rowCount } = await query(
    `INSERT INTO schema_flags (key) VALUES ('tier_basic_bronze_v2') ON CONFLICT DO NOTHING`,
  );
  if (rowCount) {
    await query(`UPDATE users SET tier = 2 WHERE role = 'worker' AND tier = 1`);
  }
  await query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tier_check`);
  await query(`ALTER TABLE users ADD CONSTRAINT users_tier_check CHECK (tier BETWEEN 1 AND 4)`);

  await query(`ALTER TABLE ledger DROP CONSTRAINT IF EXISTS ledger_kind_check`);
  await query(`
    ALTER TABLE ledger ADD CONSTRAINT ledger_kind_check CHECK (kind IN (
      'task_payout','task_payout_hold','task_payout_void',
      'withdrawal_hold','withdrawal_release',
      'withdrawal_debit','admin_adjust','deposit_credit','checkin_bonus'
    ))
  `);

  await query(`
    INSERT INTO cryptocurrencies (code, name) VALUES
      ('USDT', 'Tether USD'),
      ('BTC', 'Bitcoin')
    ON CONFLICT (code) DO NOTHING
  `);
  await query(`
    INSERT INTO blockchain_networks (code, name) VALUES
      ('TRC20', 'TRON'),
      ('ERC20', 'Ethereum'),
      ('BEP20', 'BNB Smart Chain'),
      ('BTC', 'Bitcoin')
    ON CONFLICT (code) DO NOTHING
  `);
  await query(`
    INSERT INTO cryptocurrency_networks (cryptocurrency, network) VALUES
      ('USDT', 'TRC20'),
      ('USDT', 'ERC20'),
      ('USDT', 'BEP20'),
      ('BTC', 'BTC')
    ON CONFLICT DO NOTHING
  `);

  await query(`ALTER TABLE deposits ADD COLUMN IF NOT EXISTS notes TEXT`);
  await query(`ALTER TABLE deposits ADD COLUMN IF NOT EXISTS details JSONB`);

  await query(`
    INSERT INTO platform_deposit_addresses (cryptocurrency, network, address) VALUES
      ('USDT', 'TRC20', 'TDemoPlatformReceive111111111111'),
      ('USDT', 'ERC20', '0xDEE0P1A7F0RMD3M0S3ND0NLY000001'),
      ('USDT', 'BEP20', '0xDEE0BEP20PLATFORMRECEIVE000001'),
      ('BTC', 'BTC', 'bc1qdemoplatformreceive000000001')
    ON CONFLICT (cryptocurrency, network) DO NOTHING
  `);
}
