import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { dollarsFromCents } from '../auth.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/stats', async (_req, res) => {
  const { rows: workers } = await query(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'worker'`);
  const { rows: tasks } = await query(`SELECT COUNT(*)::int AS n FROM tasks WHERE is_published = TRUE`);
  const { rows: pending } = await query(`SELECT COUNT(*)::int AS n FROM withdrawals WHERE status = 'PENDING'`);
  const { rows: unread } = await query(
    `SELECT COUNT(*)::int AS n FROM conversations c
     WHERE EXISTS (
       SELECT 1 FROM messages m
       LEFT JOIN conversation_reads r ON r.conversation_id = c.id AND r.user_id = (
         SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1
       )
       WHERE m.conversation_id = c.id
         AND m.created_at > COALESCE(r.last_read_at, 'epoch'::timestamptz)
         AND m.sender_id <> (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1)
     )`,
  );
  res.json({
    workers: workers[0].n,
    open_tasks: tasks[0].n,
    pending_withdrawals: pending[0].n,
    unread_chats: unread[0].n,
  });
});

adminRouter.get('/tasks', async (_req, res) => {
  const { rows } = await query(
    `SELECT t.*,
            (SELECT COUNT(*)::int FROM task_items i WHERE i.task_id = t.id) AS item_count,
            (SELECT COUNT(*)::int FROM assignments a WHERE a.task_id = t.id AND a.status = 'submitted') AS submissions
     FROM tasks t ORDER BY t.id DESC`,
  );
  res.json({
    tasks: rows.map((t) => ({ ...t, pay_dollars: dollarsFromCents(t.pay_cents) })),
  });
});

adminRouter.post('/tasks', async (req, res) => {
  const type = req.body?.type;
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '');
  const pay_cents = Number(req.body?.pay_cents);
  const est_minutes = Number(req.body?.est_minutes || 5);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!['image', 'text', 'intent'].includes(type)) return res.status(400).json({ error: 'invalid type' });
  if (!title) return res.status(400).json({ error: 'title required' });
  if (!Number.isInteger(pay_cents) || pay_cents < 0) return res.status(400).json({ error: 'pay_cents required' });

  const created = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO tasks (created_by, type, title, description, pay_cents, est_minutes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, type, title, description, pay_cents, est_minutes],
    );
    const task = rows[0];
    const savedItems = [];
    for (let i = 0; i < items.length; i += 1) {
      const { rows: ir } = await client.query(
        `INSERT INTO task_items (task_id, sort_order, payload) VALUES ($1,$2,$3) RETURNING *`,
        [task.id, i, items[i]],
      );
      savedItems.push(ir[0]);
    }
    return { task: { ...task, pay_dollars: dollarsFromCents(task.pay_cents) }, items: savedItems };
  });
  res.status(201).json(created);
});

adminRouter.post('/tasks/:id/items', async (req, res) => {
  const { rows: t } = await query('SELECT id FROM tasks WHERE id = $1', [req.params.id]);
  if (!t[0]) return res.status(404).json({ error: 'not found' });
  const payload = req.body?.payload;
  if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'payload required' });
  const { rows: max } = await query('SELECT COALESCE(MAX(sort_order), -1) AS m FROM task_items WHERE task_id = $1', [t[0].id]);
  const { rows } = await query(
    `INSERT INTO task_items (task_id, sort_order, payload) VALUES ($1,$2,$3) RETURNING *`,
    [t[0].id, Number(max[0].m) + 1, payload],
  );
  res.status(201).json({ item: rows[0] });
});

adminRouter.get('/withdrawals', async (_req, res) => {
  const { rows } = await query(
    `SELECT w.*, u.display_name, u.email
     FROM withdrawals w JOIN users u ON u.id = w.user_id
     ORDER BY CASE w.status WHEN 'PENDING' THEN 0 ELSE 1 END, w.id DESC`,
  );
  res.json({ withdrawals: rows.map((w) => ({ ...w, amount: Number(w.amount) })) });
});

async function settleWithdrawal(id, action) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE', [id]);
    const w = rows[0];
    if (!w) {
      const err = new Error('not found');
      err.status = 404;
      throw err;
    }
    if (w.status !== 'PENDING') {
      const err = new Error('not pending');
      err.status = 409;
      throw err;
    }
    const amount = Number(w.amount);
    await client.query('SELECT * FROM accounts WHERE user_id = $1 FOR UPDATE', [w.user_id]);
    if (action === 'approve') {
      await client.query(
        'UPDATE accounts SET frozen = frozen - $1, balance = balance - $1 WHERE user_id = $2',
        [amount, w.user_id],
      );
      await client.query(
        `INSERT INTO ledger (user_id, kind, amount, ref_type, ref_id, note)
         VALUES ($1, 'withdrawal_debit', $2, 'withdrawal', $3, 'Withdrawal approved')`,
        [w.user_id, amount, w.id],
      );
      await client.query(
        `UPDATE withdrawals SET status = 'APPROVED', updated_at = NOW() WHERE id = $1`,
        [w.id],
      );
    } else {
      await client.query(
        'UPDATE accounts SET frozen = frozen - $1 WHERE user_id = $2',
        [amount, w.user_id],
      );
      await client.query(
        `INSERT INTO ledger (user_id, kind, amount, ref_type, ref_id, note)
         VALUES ($1, 'withdrawal_release', $2, 'withdrawal', $3, 'Withdrawal rejected')`,
        [w.user_id, amount, w.id],
      );
      await client.query(
        `UPDATE withdrawals SET status = 'REJECTED', updated_at = NOW() WHERE id = $1`,
        [w.id],
      );
    }
    const { rows: done } = await client.query('SELECT * FROM withdrawals WHERE id = $1', [w.id]);
    return { withdrawal: { ...done[0], amount: Number(done[0].amount) } };
  });
}

adminRouter.post('/withdrawals/:id/approve', async (req, res) => {
  try {
    res.json(await settleWithdrawal(req.params.id, 'approve'));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

adminRouter.post('/withdrawals/:id/reject', async (req, res) => {
  try {
    res.json(await settleWithdrawal(req.params.id, 'reject'));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

adminRouter.get('/chat', async (req, res) => {
  const { rows } = await query(
    `SELECT c.id, c.worker_id, c.status, c.updated_at,
            u.display_name, u.email,
            (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_message,
            (SELECT COUNT(*)::int FROM messages m
             WHERE m.conversation_id = c.id
               AND m.sender_id <> $1
               AND m.created_at > COALESCE(
                 (SELECT last_read_at FROM conversation_reads r WHERE r.conversation_id = c.id AND r.user_id = $1),
                 'epoch'::timestamptz
               )
            ) AS unread
     FROM conversations c
     JOIN users u ON u.id = c.worker_id
     ORDER BY c.updated_at DESC`,
    [req.user.id],
  );
  res.json({ conversations: rows });
});

adminRouter.get('/chat/:id', async (req, res) => {
  const { rows: conv } = await query(
    `SELECT c.*, u.display_name FROM conversations c JOIN users u ON u.id = c.worker_id WHERE c.id = $1`,
    [req.params.id],
  );
  if (!conv[0]) return res.status(404).json({ error: 'not found' });
  const { rows: messages } = await query(
    `SELECT m.*, u.display_name, u.role
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = $1 ORDER BY m.id ASC`,
    [req.params.id],
  );
  await query(
    `INSERT INTO conversation_reads (conversation_id, user_id, last_read_at)
     VALUES ($1,$2,NOW())
     ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = NOW()`,
    [req.params.id, req.user.id],
  );
  res.json({ conversation: conv[0], messages });
});

adminRouter.post('/chat/:id', async (req, res) => {
  const content = String(req.body?.content || '').trim();
  if (!content) return res.status(400).json({ error: 'content required' });
  const { rows: conv } = await query('SELECT * FROM conversations WHERE id = $1', [req.params.id]);
  if (!conv[0]) return res.status(404).json({ error: 'not found' });
  const { rows } = await query(
    `INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1,$2,$3) RETURNING *`,
    [conv[0].id, req.user.id, content],
  );
  await query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conv[0].id]);
  const message = rows[0];
  req.app.get('io')?.to(`conv:${conv[0].id}`).emit('message:new', {
    conversation_id: conv[0].id,
    message: { ...message, display_name: req.user.display_name, role: 'admin' },
  });
  res.status(201).json({ message });
});

adminRouter.get('/recent', async (_req, res) => {
  const { rows } = await query(
    `SELECT a.id, a.submitted_at, u.display_name, t.title, t.type
     FROM assignments a
     JOIN users u ON u.id = a.worker_id
     JOIN tasks t ON t.id = a.task_id
     WHERE a.status = 'submitted'
     ORDER BY a.submitted_at DESC NULLS LAST
     LIMIT 10`,
  );
  res.json({ recent: rows });
});
