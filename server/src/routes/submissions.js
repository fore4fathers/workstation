import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { dollarsFromCents } from '../auth.js';

export const submissionsRouter = Router();
submissionsRouter.use(requireAuth);

submissionsRouter.post('/:id/submit', async (req, res) => {
  if (req.user.role !== 'worker') return res.status(403).json({ error: 'forbidden' });
  const taskId = Number(req.params.id);
  const answers = Array.isArray(req.body?.answers) ? req.body.answers : null;
  if (!answers || !answers.length) return res.status(400).json({ error: 'answers required' });

  try {
    const result = await withTransaction(async (client) => {
      const { rows: taskRows } = await client.query(
        'SELECT id, pay_cents FROM tasks WHERE id = $1 AND is_published = TRUE FOR UPDATE',
        [taskId],
      );
      const task = taskRows[0];
      if (!task) {
        const err = new Error('not found');
        err.status = 404;
        throw err;
      }

      const { rows: assignRows } = await client.query(
        `SELECT * FROM assignments WHERE task_id = $1 AND worker_id = $2 FOR UPDATE`,
        [taskId, req.user.id],
      );
      let assignment = assignRows[0];
      if (assignment?.status === 'submitted') {
        const err = new Error('already submitted');
        err.status = 409;
        throw err;
      }
      if (!assignment) {
        const inserted = await client.query(
          `INSERT INTO assignments (task_id, worker_id, status, started_at)
           VALUES ($1, $2, 'in_progress', NOW()) RETURNING *`,
          [taskId, req.user.id],
        );
        assignment = inserted.rows[0];
      }

      const { rows: items } = await client.query(
        'SELECT id, payload FROM task_items WHERE task_id = $1',
        [taskId],
      );
      const itemMap = new Map(items.map((i) => [i.id, i]));
      if (answers.length !== items.length) {
        const err = new Error('answers must cover every item');
        err.status = 400;
        throw err;
      }

      const saved = [];
      for (const ans of answers) {
        const item = itemMap.get(Number(ans.item_id));
        if (!item) {
          const err = new Error('invalid item');
          err.status = 400;
          throw err;
        }
        const answer = String(ans.answer || '').trim();
        if (!answer) {
          const err = new Error('answer required');
          err.status = 400;
          throw err;
        }
        const gold = item.payload?.gold;
        const isCorrect = gold == null ? null : answer === String(gold);
        const { rows } = await client.query(
          `INSERT INTO submissions (assignment_id, item_id, answer, is_correct)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (assignment_id, item_id) DO UPDATE SET answer = EXCLUDED.answer, is_correct = EXCLUDED.is_correct
           RETURNING *`,
          [assignment.id, item.id, answer, isCorrect],
        );
        saved.push(rows[0]);
      }

      const pay = dollarsFromCents(task.pay_cents);
      const payoutStatus = pay > 0 ? 'pending' : 'released';
      await client.query(
        `UPDATE assignments
         SET status = 'submitted', submitted_at = NOW(), payout_status = $2
         WHERE id = $1`,
        [assignment.id, payoutStatus],
      );

      if (pay > 0) {
        await client.query(
          `UPDATE accounts SET pending = pending + $1 WHERE user_id = $2`,
          [pay, req.user.id],
        );
        await client.query(
          `INSERT INTO ledger (user_id, kind, amount, ref_type, ref_id, note)
           VALUES ($1, 'task_payout_hold', $2, 'assignment', $3, $4)`,
          [req.user.id, pay, assignment.id, `Pending payout for task ${taskId}`],
        );
      }

      await client.query(
        `UPDATE users SET lifetime_completed = COALESCE(lifetime_completed, 0) + 1 WHERE id = $1`,
        [req.user.id],
      );

      const { rows: acct } = await client.query(
        'SELECT balance, frozen, pending FROM accounts WHERE user_id = $1',
        [req.user.id],
      );
      return {
        assignment_id: assignment.id,
        pay_dollars: pay,
        payout_status: payoutStatus,
        submissions: saved,
        account: {
          balance: Number(acct[0].balance),
          frozen: Number(acct[0].frozen),
          pending: Number(acct[0].pending),
        },
      };
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'submit failed' });
  }
});
