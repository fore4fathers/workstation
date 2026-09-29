import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { dollarsFromCents } from '../auth.js';
import { publicItem } from '../auth.js';

export const driveSetsRouter = Router();
driveSetsRouter.use(requireAuth);

driveSetsRouter.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT ds.*, t.title, t.type, t.pay_cents
     FROM drive_sets ds
     JOIN tasks t ON t.id = ds.task_id
     WHERE ds.user_id = $1
     ORDER BY ds.assigned_at DESC`,
    [req.user.id]
  );
  res.json({
    drive_sets: rows.map((r) => ({
      ...r,
      pay_dollars: dollarsFromCents(r.pay_cents),
    })),
  });
});

driveSetsRouter.get('/:id', async (req, res) => {
  const { rows: ds } = await query(
    `SELECT ds.*, t.title, t.type, t.pay_cents
     FROM drive_sets ds
     JOIN tasks t ON t.id = ds.task_id
     WHERE ds.id = $1 AND ds.user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!ds[0]) return res.status(404).json({ error: 'not found' });
  res.json({ drive_set: { ...ds[0], pay_dollars: dollarsFromCents(ds[0].pay_cents) } });
});

driveSetsRouter.post('/answer', async (req, res) => {
  const drive_set_id = Number(req.body?.drive_set_id);
  const image_index = Number(req.body?.image_index);
  const selected_option_index = Number(req.body?.selected_option_index);
  const task_id = Number(req.body?.task_id);

  if (!drive_set_id || image_index === undefined || selected_option_index === undefined || !task_id) {
    return res.status(400).json({ error: 'drive_set_id, image_index, selected_option_index, task_id required' });
  }

  // Verify the drive set belongs to this user
  const { rows: ds } = await query('SELECT * FROM drive_sets WHERE id = $1 AND user_id = $2', [drive_set_id, req.user.id]);
  if (!ds[0]) return res.status(404).json({ error: 'drive set not found' });
  if (ds[0].status !== 'active') return res.status(400).json({ error: 'drive set not active' });

  // Fetch the task item
  const { rows: items } = await query(
    'SELECT id, sort_order, payload FROM task_items WHERE task_id = $1 ORDER BY sort_order, id LIMIT 1 OFFSET $2',
    [task_id, image_index]
  );
  if (!items[0]) return res.status(404).json({ error: 'image not found' });

  const payload = items[0].payload;
  const gold = payload?.gold || '';
  const labels = (payload?.labels || payload?.intents || []);
  if (gold && !labels.includes(gold)) labels.push(gold);
  const shuffled = [...labels].sort(() => Math.random() - 0.5);
  const correctIdx = shuffled.indexOf(gold);

  const isCorrect = selected_option_index === correctIdx;
  const commission_cents = isCorrect ? 50 : 0; // fixed 50 cents per correct

  // Record commission
  const conn = await query('BEGIN');
  try {
    await query(
      `INSERT INTO image_commissions (user_id, task_id, image_index, selected_label, is_correct, commission_cents)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, task_id, image_index)
       DO UPDATE SET selected_label = EXCLUDED.selected_label,
                     is_correct = EXCLUDED.is_correct,
                     commission_cents = EXCLUDED.commission_cents`,
      [req.user.id, task_id, image_index, shuffled[selected_option_index], isCorrect, commission_cents]
    );

    // Update user balance if correct
    if (isCorrect) {
      await query(
        'UPDATE accounts SET balance = balance + $1 WHERE user_id = $2',
        [commission_cents, req.user.id]
      );
    }

    // Update drive set progress
    await query(
      `UPDATE drive_sets SET correct_count = correct_count + $1, total_commission = total_commission + $2 WHERE id = $3`,
      [isCorrect ? 1 : 0, commission_cents, drive_set_id]
    );

    await query('COMMIT');
  } catch (e) {
    await query('ROLLBACK');
    throw e;
  }

  res.json({ is_correct: isCorrect, commission_cents, correct_label: gold });
});

driveSetsRouter.post('/:id/complete', async (req, res) => {
  const { rows: ds } = await query('SELECT * FROM drive_sets WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!ds[0]) return res.status(404).json({ error: 'not found' });
  if (ds[0].status !== 'active') return res.status(400).json({ error: 'not active' });

  await query(
    `UPDATE drive_sets SET status = 'completed', completed_at = NOW() WHERE id = $1`,
    [req.params.id]
  );

  res.json({ completed: true });
});