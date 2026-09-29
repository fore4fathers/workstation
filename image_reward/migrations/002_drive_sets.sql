-- 002_drive_sets.sql: Admin drive-set assignment system (uses existing task_items / image_commissions)

-- Drive set definition: admin assigns a user a 20-image set from task_items
CREATE TABLE IF NOT EXISTS drive_sets (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    assigned_by INTEGER REFERENCES users(id),        -- admin who assigned
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','completed','cancelled')),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    total_items INTEGER NOT NULL DEFAULT 20,
    correct_count INTEGER NOT NULL DEFAULT 0,
    TOTAL_COMMISSION INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_drive_sets_user ON drive_sets(user_id, status);
CREATE INDEX IF NOT EXISTS idx_drive_sets_task ON drive_sets(task_id);

COMMENT ON TABLE drive_sets IS 'Admin-assigned image identification sets per user';
COMMENT ON COLUMN drive_sets.total_items IS 'Number of images in the set (default 20)';
COMMENT ON COLUMN drive_sets.correct_count IS 'How many correct answers user gave';
COMMENT ON COLUMN drive_sets.TOTAL_COMMISSION IS 'Sum of commission_cents earned in this set';