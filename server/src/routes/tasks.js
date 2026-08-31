import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { publicItem, dollarsFromCents } from '../auth.js';

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

tasksRouter.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT t.id, t.type, t.title, t.description, t.pay_cents, t.est_minutes, t.created_at,
            a.status AS assignment_status,
            (SELECT COUNT(*)::int FROM task_items i WHERE i.task_id = t.id) AS item_count
     FROM tasks t
     LEFT JOIN assignments a ON a.task_id = t.id AND a.worker_id = $1
     WHERE t.is_published = TRUE
     ORDER BY t.id ASC`,
    [req.user.id],
  );
  res.json({
    tasks: rows.map((t) => ({
      ...t,
      pay_dollars: dollarsFromCents(t.pay_cents),
    })),
  });
});

tasksRouter.get('/:id', async (req, res) => {
  const { rows } = await query(
    `SELECT id, type, title, description, pay_cents, est_minutes, is_published
     FROM tasks WHERE id = $1`,
    [req.params.id],
  );
  const task = rows[0];
  if (!task || !task.is_published) return res.status(404).json({ error: 'not found' });
  const { rows: items } = await query(
    'SELECT id, sort_order, payload FROM task_items WHERE task_id = $1 ORDER BY sort_order, id',
    [task.id],
  );
  res.json({
    task: { ...task, pay_dollars: dollarsFromCents(task.pay_cents) },
    items: items.map((i) => ({ id: i.id, sort_order: i.sort_order, payload: publicItem(i.payload) })),
  });
});

tasksRouter.post('/:id/start', async (req, res) => {
  if (req.user.role !== 'worker') return res.status(403).json({ error: 'forbidden' });
  const { rows: tasks } = await query(
    'SELECT id FROM tasks WHERE id = $1 AND is_published = TRUE',
    [req.params.id],
  );
  if (!tasks[0]) return res.status(404).json({ error: 'not found' });
  const { rows } = await query(
    `INSERT INTO assignments (task_id, worker_id, status, started_at)
     VALUES ($1, $2, 'in_progress', NOW())
     ON CONFLICT (task_id, worker_id)
     DO UPDATE SET
       status = CASE WHEN assignments.status = 'submitted' THEN assignments.status ELSE 'in_progress' END,
       started_at = COALESCE(assignments.started_at, NOW())
     RETURNING *`,
    [tasks[0].id, req.user.id],
  );
  const assignment = rows[0];
  if (assignment.status === 'submitted') {
    return res.status(409).json({ error: 'already submitted', assignment });
  }
  res.json({ assignment });
});
