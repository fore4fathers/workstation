import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { query, withTransaction } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { dollarsFromCents } from '../auth.js';
import { config } from '../config.js';

const IMAGE_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

function saveImageUpload({ name, mime, data }) {
  const ext = IMAGE_EXT[String(mime || '').toLowerCase()]
    || IMAGE_EXT[`image/${path.extname(String(name || '')).slice(1).toLowerCase()}`]
    || null;
  if (!ext) {
    const err = new Error('images only (jpg, png, gif, webp)');
    err.status = 400;
    throw err;
  }
  const raw = String(data || '');
  const b64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) {
    const err = new Error('empty file');
    err.status = 400;
    throw err;
  }
  if (buf.length > 5 * 1024 * 1024) {
    const err = new Error('file too large (5MB)');
    err.status = 400;
    throw err;
  }
  const filename = `${crypto.randomBytes(16).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(config.uploadDir, filename), buf);
  return { url: `/uploads/${filename}`, name: name || filename };
}

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/stats', async (_req, res) => {
  const { rows: workers } = await query(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'worker'`);
  const { rows: tasks } = await query(`SELECT COUNT(*)::int AS n FROM tasks WHERE is_published = TRUE`);
  const { rows: pending } = await query(`SELECT COUNT(*)::int AS n FROM withdrawals WHERE status = 'PENDING'`);
  const { rows: pendingPay } = await query(
    `SELECT COUNT(*)::int AS n FROM assignments WHERE status = 'submitted' AND payout_status = 'pending'`,
  );
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
    pending_payouts: pendingPay[0].n,
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
    `SELECT a.id, a.submitted_at, a.payout_status, u.display_name, t.title, t.type
     FROM assignments a
     JOIN users u ON u.id = a.worker_id
     JOIN tasks t ON t.id = a.task_id
     WHERE a.status = 'submitted'
     ORDER BY a.submitted_at DESC NULLS LAST
     LIMIT 10`,
  );
  res.json({ recent: rows });
});

adminRouter.get('/tasks/:id', async (req, res) => {
  const { rows } = await query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  const task = rows[0];
  const { rows: items } = await query(
    'SELECT id, sort_order, payload FROM task_items WHERE task_id = $1 ORDER BY sort_order, id',
    [task.id],
  );
  const { rows: subs } = await query(
    `SELECT a.id AS assignment_id, a.submitted_at, a.payout_status, u.display_name, u.email,
            json_agg(json_build_object('item_id', s.item_id, 'answer', s.answer, 'is_correct', s.is_correct)
                     ORDER BY s.item_id) AS answers
     FROM assignments a
     JOIN users u ON u.id = a.worker_id
     JOIN submissions s ON s.assignment_id = a.id
     WHERE a.task_id = $1 AND a.status = 'submitted'
     GROUP BY a.id, u.display_name, u.email
     ORDER BY a.submitted_at DESC
     LIMIT 50`,
    [task.id],
  );
  res.json({
    task: { ...task, pay_dollars: dollarsFromCents(task.pay_cents) },
    items,
    submissions: subs,
  });
});

adminRouter.patch('/tasks/:id', async (req, res) => {
  const { rows: t } = await query('SELECT id FROM tasks WHERE id = $1', [req.params.id]);
  if (!t[0]) return res.status(404).json({ error: 'not found' });
  if (typeof req.body?.is_published !== 'boolean') {
    return res.status(400).json({ error: 'is_published required' });
  }
  const { rows } = await query(
    'UPDATE tasks SET is_published = $1 WHERE id = $2 RETURNING *',
    [req.body.is_published, t[0].id],
  );
  res.json({ task: { ...rows[0], pay_dollars: dollarsFromCents(rows[0].pay_cents) } });
});

adminRouter.get('/payouts', async (_req, res) => {
  const { rows } = await query(
    `SELECT a.id, a.worker_id, a.task_id, a.submitted_at, a.payout_status,
            u.display_name, u.email,
            t.title, t.type, t.pay_cents,
            (SELECT COUNT(*) FILTER (WHERE s.is_correct IS NOT NULL)::int
               FROM submissions s WHERE s.assignment_id = a.id) AS graded,
            (SELECT COUNT(*) FILTER (WHERE s.is_correct = TRUE)::int
               FROM submissions s WHERE s.assignment_id = a.id) AS correct
     FROM assignments a
     JOIN users u ON u.id = a.worker_id
     JOIN tasks t ON t.id = a.task_id
     WHERE a.status = 'submitted' AND a.payout_status = 'pending'
     ORDER BY a.submitted_at ASC NULLS LAST`,
  );
  res.json({
    payouts: rows.map((r) => ({
      ...r,
      pay_dollars: dollarsFromCents(r.pay_cents),
      accuracy: r.graded > 0 ? Math.round((r.correct / r.graded) * 100) : null,
    })),
  });
});

async function settlePayout(id, action) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT a.id, a.worker_id, a.status, a.payout_status, t.pay_cents
       FROM assignments a
       JOIN tasks t ON t.id = a.task_id
       WHERE a.id = $1
       FOR UPDATE OF a`,
      [id],
    );
    const a = rows[0];
    if (!a) {
      const err = new Error('not found');
      err.status = 404;
      throw err;
    }
    if (a.status !== 'submitted' || a.payout_status !== 'pending') {
      const err = new Error('not pending');
      err.status = 409;
      throw err;
    }
    const pay = dollarsFromCents(a.pay_cents);
    await client.query('SELECT user_id FROM accounts WHERE user_id = $1 FOR UPDATE', [a.worker_id]);
    if (action === 'release') {
      await client.query(
        'UPDATE accounts SET pending = pending - $1, balance = balance + $1 WHERE user_id = $2',
        [pay, a.worker_id],
      );
      await client.query(`UPDATE assignments SET payout_status = 'released' WHERE id = $1`, [a.id]);
      await client.query(
        `INSERT INTO ledger (user_id, kind, amount, ref_type, ref_id, note)
         VALUES ($1, 'task_payout', $2, 'assignment', $3, 'Payout released')`,
        [a.worker_id, pay, a.id],
      );
    } else {
      await client.query(
        'UPDATE accounts SET pending = pending - $1 WHERE user_id = $2',
        [pay, a.worker_id],
      );
      await client.query(`UPDATE assignments SET payout_status = 'voided' WHERE id = $1`, [a.id]);
      await client.query(
        `INSERT INTO ledger (user_id, kind, amount, ref_type, ref_id, note)
         VALUES ($1, 'task_payout_void', $2, 'assignment', $3, 'Payout voided')`,
        [a.worker_id, pay, a.id],
      );
    }
    const { rows: done } = await client.query('SELECT * FROM assignments WHERE id = $1', [a.id]);
    return { assignment: done[0], pay_dollars: pay };
  });
}

adminRouter.post('/payouts/:id/release', async (req, res) => {
  try {
    res.json(await settlePayout(req.params.id, 'release'));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

adminRouter.post('/payouts/:id/void', async (req, res) => {
  try {
    res.json(await settlePayout(req.params.id, 'void'));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

adminRouter.get('/workers', async (_req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.email, u.display_name, u.is_active, u.lifetime_completed, u.created_at,
            ac.balance, ac.frozen, ac.pending,
            (SELECT COUNT(*)::int FROM assignments a
              WHERE a.worker_id = u.id AND a.status = 'submitted') AS submitted
     FROM users u
     JOIN accounts ac ON ac.user_id = u.id
     WHERE u.role = 'worker'
     ORDER BY u.id ASC`,
  );
  res.json({
    workers: rows.map((r) => ({
      ...r,
      balance: Number(r.balance),
      frozen: Number(r.frozen),
      pending: Number(r.pending),
    })),
  });
});

adminRouter.post('/workers/:id/active', async (req, res) => {
  const is_active = Boolean(req.body?.is_active);
  const { rows: u } = await query('SELECT id, role FROM users WHERE id = $1', [req.params.id]);
  if (!u[0]) return res.status(404).json({ error: 'not found' });
  if (u[0].role !== 'worker') return res.status(400).json({ error: 'workers only' });
  const { rows } = await query(
    `UPDATE users SET is_active = $1 WHERE id = $2
     RETURNING id, email, display_name, role, is_active`,
    [is_active, u[0].id],
  );
  res.json({ user: rows[0] });
});

adminRouter.post('/uploads', (req, res) => {
  try {
    const incoming = Array.isArray(req.body?.files) ? req.body.files : [];
    if (!incoming.length) return res.status(400).json({ error: 'files required' });
    if (incoming.length > 20) return res.status(400).json({ error: 'max 20 files' });
    const files = incoming.map(saveImageUpload);
    res.status(201).json({ files });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'upload failed' });
  }
});
