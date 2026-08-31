CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'worker')),
  avatar_url           TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  lifetime_completed   INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE accounts (
  user_id  INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  frozen   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (frozen >= 0)
);

CREATE TABLE ledger (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  kind        TEXT NOT NULL CHECK (kind IN (
                'task_payout','withdrawal_hold','withdrawal_release',
                'withdrawal_debit','admin_adjust')),
  amount      NUMERIC(12,2) NOT NULL,
  ref_type    TEXT,
  ref_id      INTEGER,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE withdrawals (
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

CREATE TABLE tasks (
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

CREATE TABLE task_items (
  id         SERIAL PRIMARY KEY,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  payload    JSONB NOT NULL
);

CREATE TABLE assignments (
  id           SERIAL PRIMARY KEY,
  task_id      INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  worker_id    INTEGER NOT NULL REFERENCES users(id),
  status       TEXT NOT NULL DEFAULT 'available'
                 CHECK (status IN ('available','in_progress','submitted')),
  started_at   TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  UNIQUE (task_id, worker_id)
);

CREATE TABLE submissions (
  id            SERIAL PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  item_id       INTEGER NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
  answer        TEXT NOT NULL,
  is_correct    BOOLEAN,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id, item_id)
);

CREATE TABLE conversations (
  id           SERIAL PRIMARY KEY,
  worker_id    INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE messages (
  id               SERIAL PRIMARY KEY,
  conversation_id  INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id        INTEGER NOT NULL REFERENCES users(id),
  content          TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE conversation_reads (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_ledger_user ON ledger(user_id, created_at DESC);
CREATE INDEX idx_withdrawals_status ON withdrawals(status);
CREATE INDEX idx_tasks_type ON tasks(type) WHERE is_published;
CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at);
