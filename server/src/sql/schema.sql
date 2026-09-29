CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'worker')),
  tier                 INTEGER NOT NULL DEFAULT 2 CHECK (tier BETWEEN 1 AND 4),
  avatar_url           TEXT,
  phone                TEXT,
  email_verified       BOOLEAN NOT NULL DEFAULT TRUE,
  verification_code    TEXT,
  verification_expires TIMESTAMPTZ,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  lifetime_completed   INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  user_id  INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  frozen   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (frozen >= 0),
  pending  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (pending >= 0)
);

CREATE TABLE IF NOT EXISTS ledger (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  kind        TEXT NOT NULL CHECK (kind IN (
                'task_payout','task_payout_hold','task_payout_void',
                'withdrawal_hold','withdrawal_release',
                'withdrawal_debit','admin_adjust','deposit_credit','checkin_bonus')),
  amount      NUMERIC(12,2) NOT NULL,
  ref_type    TEXT,
  ref_id      INTEGER,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status      TEXT NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  method      TEXT NOT NULL DEFAULT 'demo',
  address     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id            SERIAL PRIMARY KEY,
  created_by    INTEGER NOT NULL REFERENCES users(id),
  type          TEXT NOT NULL CHECK (type IN ('image','text','intent')),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  pay_cents     INTEGER NOT NULL CHECK (pay_cents >= 0),
  est_minutes   INTEGER NOT NULL DEFAULT 5,
  is_published  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_items (
  id         SERIAL PRIMARY KEY,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  payload    JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id             SERIAL PRIMARY KEY,
  task_id        INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  worker_id      INTEGER NOT NULL REFERENCES users(id),
  status         TEXT NOT NULL DEFAULT 'available'
                   CHECK (status IN ('available','in_progress','submitted')),
  payout_status  TEXT NOT NULL DEFAULT 'pending'
                   CHECK (payout_status IN ('none','pending','released','voided')),
  payout_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  started_at     TIMESTAMPTZ,
  submitted_at   TIMESTAMPTZ,
  UNIQUE (task_id, worker_id)
);

CREATE TABLE IF NOT EXISTS submissions (
  id            SERIAL PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  item_id       INTEGER NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
  answer        TEXT NOT NULL,
  is_correct    BOOLEAN,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id, item_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id           SERIAL PRIMARY KEY,
  worker_id    INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id               SERIAL PRIMARY KEY,
  conversation_id  INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id        INTEGER NOT NULL REFERENCES users(id),
  content          TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_reads (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS deposits (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status      TEXT NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  method      TEXT NOT NULL DEFAULT 'demo',
  tx_ref      TEXT,
  notes       TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_deposit_addresses (
  id             SERIAL PRIMARY KEY,
  cryptocurrency TEXT NOT NULL,
  network        TEXT NOT NULL,
  address        TEXT NOT NULL,
  UNIQUE (cryptocurrency, network)
);

CREATE TABLE IF NOT EXISTS daily_checkins (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  checkin_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  bonus              NUMERIC(12,2) NOT NULL DEFAULT 0.10,
  streak_day         INTEGER NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, checkin_date)
);

CREATE TABLE IF NOT EXISTS user_checkin_stats (
  user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_checkins     INTEGER NOT NULL DEFAULT 0,
  current_streak     INTEGER NOT NULL DEFAULT 0,
  longest_streak     INTEGER NOT NULL DEFAULT 0,
  last_checkin_date  DATE
);

CREATE TABLE IF NOT EXISTS cryptocurrencies (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blockchain_networks (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cryptocurrency_networks (
  cryptocurrency TEXT NOT NULL REFERENCES cryptocurrencies(code) ON DELETE CASCADE,
  network        TEXT NOT NULL REFERENCES blockchain_networks(code) ON DELETE CASCADE,
  PRIMARY KEY (cryptocurrency, network)
);

CREATE TABLE IF NOT EXISTS user_wallet_addresses (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cryptocurrency  TEXT NOT NULL REFERENCES cryptocurrencies(code),
  network         TEXT NOT NULL REFERENCES blockchain_networks(code),
  address         TEXT NOT NULL,
  label           TEXT,
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type) WHERE is_published;
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);
CREATE INDEX IF NOT EXISTS idx_wallet_addr_user ON user_wallet_addresses(user_id);
