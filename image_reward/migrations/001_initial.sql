-- 001_initial.sql: Image reward commission system migration

-- Add image_commissions table to track image identification sessions
-- using existing task_items payload ({gold, labels, image_url})

CREATE TABLE IF NOT EXISTS image_commissions (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id         INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    image_index     INTEGER NOT NULL,               -- 0..19 which image in the set
    selected_label  TEXT NOT NULL,                  -- the label the user selected
    is_correct      BOOLEAN NOT NULL DEFAULT FALSE, -- whether selection was correct
    commission_cents INTEGER NOT NULL DEFAULT 0,   -- commission amount added
    answered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, task_id, image_index)
);

CREATE INDEX IF NOT EXISTS idx_image_commissions_user
    ON image_commissions (user_id);
CREATE INDEX IF NOT EXISTS idx_image_commissions_task
    ON image_commissions (task_id);

COMMENT ON TABLE image_commissions IS
'Tracks user image identification selections and commissions earned.';
COMMENT ON COLUMN image_commissions.image_index IS
'0-19 which image in the 20-image set';
COMMENT ON COLUMN image_commissions.selected_label IS
'The label the user chose (should match task_items.payload.gold for correct)';