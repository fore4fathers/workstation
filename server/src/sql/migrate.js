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
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deposit_address TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deposit_cryptocurrency TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deposit_network TEXT`);
  await query(`ALTER TABLE withdrawals ALTER COLUMN method SET DEFAULT 'bank'`);
  await query(`ALTER TABLE deposits ALTER COLUMN method SET DEFAULT 'bank'`);
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
  await query(`UPDATE tasks SET description = 'Label images for AI datasets'
    WHERE title = 'Image Labeling'
      AND description = ('Label images for AI ' || CHR(116) || CHR(114) || CHR(97) || CHR(105) || CHR(110) || CHR(105) || CHR(110) || CHR(103))`);

  await query(`
    CREATE TABLE IF NOT EXISTS drive_sets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      assigned_by INTEGER REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      total_items INTEGER NOT NULL DEFAULT 20,
      correct_count INTEGER NOT NULL DEFAULT 0,
      total_commission INTEGER NOT NULL DEFAULT 0,
      commission_cents INTEGER NOT NULL DEFAULT 50,
      alternative_commission_cents INTEGER NOT NULL DEFAULT 25,
      foreign_commission_cents INTEGER NOT NULL DEFAULT 50
    )
  `);
  await query(`ALTER TABLE drive_sets ADD COLUMN IF NOT EXISTS commission_cents INTEGER NOT NULL DEFAULT 50`);
  await query(`ALTER TABLE drive_sets ADD COLUMN IF NOT EXISTS alternative_commission_cents INTEGER NOT NULL DEFAULT 25`);
  await query(`ALTER TABLE drive_sets ADD COLUMN IF NOT EXISTS foreign_commission_cents INTEGER NOT NULL DEFAULT 50`);
  await query(`
    CREATE TABLE IF NOT EXISTS image_commissions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      drive_set_id INTEGER REFERENCES drive_sets(id) ON DELETE CASCADE,
      image_index INTEGER NOT NULL,
      selected_label TEXT NOT NULL,
      is_correct BOOLEAN NOT NULL DEFAULT FALSE,
      commission_cents INTEGER NOT NULL DEFAULT 0,
      answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE image_commissions ADD COLUMN IF NOT EXISTS drive_set_id INTEGER REFERENCES drive_sets(id) ON DELETE CASCADE`);
  await query(`ALTER TABLE image_commissions ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await query(`ALTER TABLE image_commissions ADD COLUMN IF NOT EXISTS response_type TEXT`);
  await query(`UPDATE image_commissions SET response_type = CASE WHEN is_correct THEN 'best_match' ELSE 'alternative_match' END WHERE response_type IS NULL`);
  await query(`ALTER TABLE image_commissions ALTER COLUMN response_type SET DEFAULT 'best_match'`);
  await query(`ALTER TABLE image_commissions ALTER COLUMN response_type SET NOT NULL`);
  await query(`ALTER TABLE image_commissions DROP CONSTRAINT IF EXISTS image_commissions_response_type_check`);
  await query(`ALTER TABLE image_commissions ADD CONSTRAINT image_commissions_response_type_check CHECK (response_type IN ('best_match','alternative_match','foreign_language'))`);
  const { rowCount: alternativeRewardBackfill } = await query(
    `INSERT INTO schema_flags (key) VALUES ('drive_set_alternative_reward_backfill_v1') ON CONFLICT DO NOTHING`,
  );
  if (alternativeRewardBackfill) {
    try {
      await query(`
        WITH adjustments AS MATERIALIZED (
          SELECT ic.user_id,
                 SUM(GREATEST(ds.alternative_commission_cents - ic.commission_cents, 0))::numeric AS cents
          FROM image_commissions ic
          JOIN drive_sets ds ON ds.id = ic.drive_set_id
          WHERE ic.response_type = 'alternative_match' AND NOT ic.is_correct
          GROUP BY ic.user_id
        ), updated AS (
          UPDATE image_commissions ic
          SET commission_cents = GREATEST(ic.commission_cents, ds.alternative_commission_cents)
          FROM drive_sets ds
          WHERE ds.id = ic.drive_set_id
            AND ic.response_type = 'alternative_match'
            AND NOT ic.is_correct
          RETURNING ic.user_id
        )
        UPDATE accounts a
        SET balance = a.balance + adjustments.cents / 100
        FROM adjustments
        WHERE a.user_id = adjustments.user_id
          AND EXISTS (SELECT 1 FROM updated WHERE updated.user_id = a.user_id)
      `);
    } catch (error) {
      await query(`DELETE FROM schema_flags WHERE key = 'drive_set_alternative_reward_backfill_v1'`);
      throw error;
    }
  }
  const { rowCount: foreignRewardBackfill } = await query(
    `INSERT INTO schema_flags (key) VALUES ('drive_set_foreign_reward_backfill_v1') ON CONFLICT DO NOTHING`,
  );
  if (foreignRewardBackfill) {
    try {
      await query(`
        WITH adjustments AS MATERIALIZED (
          SELECT ic.user_id,
                 SUM(GREATEST(ds.commission_cents - ic.commission_cents, 0))::numeric AS cents
          FROM image_commissions ic
          JOIN drive_sets ds ON ds.id = ic.drive_set_id
          WHERE ic.response_type = 'foreign_language'
          GROUP BY ic.user_id
        ), updated AS (
          UPDATE image_commissions ic
          SET commission_cents = GREATEST(ic.commission_cents, ds.commission_cents)
          FROM drive_sets ds
          WHERE ds.id = ic.drive_set_id
            AND ic.response_type = 'foreign_language'
          RETURNING ic.user_id
        )
        UPDATE accounts a
        SET balance = a.balance + adjustments.cents / 100
        FROM adjustments
        WHERE a.user_id = adjustments.user_id
          AND EXISTS (SELECT 1 FROM updated WHERE updated.user_id = a.user_id)
      `);
      await query(`UPDATE drive_sets SET foreign_commission_cents = commission_cents WHERE foreign_commission_cents <> commission_cents`);
    } catch (error) {
      await query(`DELETE FROM schema_flags WHERE key = 'drive_set_foreign_reward_backfill_v1'`);
      throw error;
    }
  }
  await query(`ALTER TABLE image_commissions DROP CONSTRAINT IF EXISTS image_commissions_user_id_task_id_image_index_key`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_image_commissions_set_image ON image_commissions(drive_set_id, image_index)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_drive_sets_user ON drive_sets(user_id, status)`);

  await query(`DELETE FROM platform_deposit_addresses
    WHERE (network = 'TRC20' AND address LIKE 'T%PlatformReceive111111111111')
       OR (network = 'ERC20' AND address LIKE '0xDEE0P1A7F0RM%000001')
       OR (network = 'BEP20' AND address LIKE '0xDEE0BEP20PLATFORMRECEIVE000001')
       OR (network = 'BTC' AND address LIKE 'bc1q%platformreceive000000001')`);
}
