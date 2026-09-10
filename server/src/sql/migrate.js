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

  await query(`ALTER TABLE ledger DROP CONSTRAINT IF EXISTS ledger_kind_check`);
  await query(`
    ALTER TABLE ledger ADD CONSTRAINT ledger_kind_check CHECK (kind IN (
      'task_payout','task_payout_hold','task_payout_void',
      'withdrawal_hold','withdrawal_release',
      'withdrawal_debit','admin_adjust'
    ))
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
}
