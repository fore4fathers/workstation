import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { publicItem, dollarsFromCents } from '../auth.js';
import { applyTierPay } from '../tiers.js';

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

tasksRouter.get('/', async (req, res) => {
  const type = req.query.type ? String(req.query.type) : null;
  const params = [req.user.id];
  let typeSql = '';
  if (type && ['image', 'text', 'intent'].includes(type)) {
    params.push(type);
    typeSql = ` AND t.type = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT t.id, t.type, t.title, t.description, t.translations, t.pay_cents, t.single_pay_cents, t.engagement_type, t.est_minutes, t.created_at,
            a.id AS assignment_id, a.status AS assignment_status, a.submitted_at, a.payout_status, a.payout_amount,
            COALESCE((SELECT SUM(ai.bonus_cents)::int FROM assignment_items ai WHERE ai.assignment_id = a.id), 0) AS bonus_cents,
            CASE WHEN a.id IS NULL
              THEN (SELECT COUNT(*)::int FROM task_items i WHERE i.task_id = t.id)
              ELSE (SELECT COUNT(*)::int FROM assignment_items ai WHERE ai.assignment_id = a.id)
            END AS item_count,
            (SELECT i.payload->>'image_url' FROM task_items i WHERE i.task_id = t.id ORDER BY i.sort_order, i.id LIMIT 1) AS image_url
     FROM tasks t
     LEFT JOIN assignments a ON a.task_id = t.id AND a.worker_id = $1
     WHERE t.is_published = TRUE${typeSql}
     ORDER BY t.id ASC`,
    params,
  );
  res.json({
    tasks: rows.map((t) => ({
      ...t,
      pay_dollars: applyTierPay(dollarsFromCents(t.pay_cents + (t.bonus_cents || 0)), req.user.tier),
      base_pay_dollars: dollarsFromCents(t.pay_cents),
      bonus_dollars: dollarsFromCents(t.bonus_cents || 0),
    })),
  });
});

tasksRouter.get('/:id', async (req, res) => {
  const { rows } = await query(
    `SELECT id, type, title, description, translations, pay_cents, single_pay_cents, engagement_type, est_minutes, is_published
     FROM tasks WHERE id = $1`,
    [req.params.id],
  );
  const task = rows[0];
  if (!task || !task.is_published) return res.status(404).json({ error: 'not found' });
  const { rows: assignments } = await query(
    'SELECT id, current_assignment_item_id FROM assignments WHERE task_id = $1 AND worker_id = $2',
    [task.id, req.user.id],
  );
  const assignment = assignments[0];
  let items;
  let bonusCents = 0;
  if (assignment) {
    const [{ rows: assignmentItems }, { rows: bonuses }] = await Promise.all([
      query('SELECT id, source_item_id, sort_order, payload, bonus_cents FROM assignment_items WHERE assignment_id = $1 ORDER BY sort_order, id', [assignment.id]),
      query('SELECT COALESCE(SUM(bonus_cents), 0)::int AS bonus_cents FROM assignment_items WHERE assignment_id = $1', [assignment.id]),
    ]);
    items = assignmentItems.length ? assignmentItems : null;
    bonusCents = bonuses[0]?.bonus_cents || 0;
  }
  if (!items) {
    const { rows } = await query(
      'SELECT id, id AS source_item_id, sort_order, payload, 0::int AS bonus_cents FROM task_items WHERE task_id = $1 ORDER BY sort_order, id',
      [task.id],
    );
    items = rows;
  }
  res.json({
    task: {
      ...task,
      pay_dollars: applyTierPay(dollarsFromCents(task.pay_cents + bonusCents), req.user.tier),
      base_pay_dollars: dollarsFromCents(task.pay_cents),
      bonus_dollars: dollarsFromCents(bonusCents),
    },
    current_item_id: assignment?.current_assignment_item_id || null,
    items: items.map((i) => ({ id: i.id, source_item_id: i.source_item_id, sort_order: i.sort_order, bonus_cents: i.bonus_cents, payload: publicItem(i.payload) })),
  });
});

tasksRouter.post('/:id/start', async (req, res) => {
  if (req.user.role !== 'worker') return res.status(403).json({ error: 'forbidden' });
  let assignment;
  try {
    assignment = await withTransaction(async (client) => {
      const { rows: tasks } = await client.query(
        'SELECT id FROM tasks WHERE id = $1 AND is_published = TRUE FOR SHARE',
        [req.params.id],
      );
      if (!tasks[0]) return null;
      const { rows } = await client.query(
        `INSERT INTO assignments (task_id, worker_id, status, started_at)
         VALUES ($1, $2, 'in_progress', NOW())
         ON CONFLICT (task_id, worker_id)
         DO UPDATE SET
           status = CASE WHEN assignments.status = 'submitted' THEN assignments.status ELSE 'in_progress' END,
           started_at = COALESCE(assignments.started_at, NOW())
         RETURNING *`,
        [tasks[0].id, req.user.id],
      );
      const current = rows[0];
      await client.query(
        `INSERT INTO assignment_items (assignment_id, source_item_id, sort_order, payload)
         SELECT $1, ranked.id, ranked.seq_order, ranked.payload
         FROM (
           SELECT i.id, i.payload, ROW_NUMBER() OVER (ORDER BY i.sort_order, i.id) - 1 AS seq_order
           FROM task_items i WHERE i.task_id = $2
         ) ranked
         ON CONFLICT (assignment_id, sort_order) DO NOTHING`,
        [current.id, current.task_id],
      );
      const { rows: firstItems } = await client.query(
        `SELECT id FROM assignment_items WHERE assignment_id = $1
         ORDER BY sort_order, id LIMIT 1`,
        [current.id],
      );
      const { rows: saved } = await client.query(
        `UPDATE assignments SET current_assignment_item_id = COALESCE(current_assignment_item_id, $2)
         WHERE id = $1 RETURNING *`,
        [current.id, firstItems[0]?.id || null],
      );
      return saved[0];
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'could not start task' });
  }
  if (!assignment) return res.status(404).json({ error: 'not found' });
  if (assignment.status === 'submitted') {
    return res.status(409).json({ error: 'already submitted', assignment });
  }
  res.json({ assignment });
});

tasksRouter.post('/:id/progress', async (req, res) => {
  if (req.user.role !== 'worker') return res.status(403).json({ error: 'forbidden' });
  const itemId = Number(req.body?.item_id);
  if (!Number.isInteger(itemId) || itemId < 1) return res.status(400).json({ error: 'item_id required' });
  const { rows } = await query(
    `UPDATE assignments a
     SET current_assignment_item_id = i.id
     FROM assignment_items i
     WHERE a.task_id = $1 AND a.worker_id = $2 AND a.status = 'in_progress'
       AND i.id = $3 AND i.assignment_id = a.id
     RETURNING a.id, a.current_assignment_item_id`,
    [req.params.id, req.user.id, itemId],
  );
  if (!rows[0]) return res.status(404).json({ error: 'active assignment or item not found' });
  res.json({ assignment: rows[0] });
});
