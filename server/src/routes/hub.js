import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { dollarsFromCents } from '../auth.js';
import { applyTierPay, tierInfo } from '../tiers.js';

export const hubRouter = Router();
hubRouter.use(requireAuth);

hubRouter.get('/', async (req, res) => {
  const { rows: typeRows } = await query(
    `SELECT DISTINCT ON (t.type)
            t.id, t.type, t.title, t.description, t.pay_cents, t.est_minutes,
            a.status AS assignment_status
     FROM tasks t
     LEFT JOIN assignments a ON a.task_id = t.id AND a.worker_id = $1
     WHERE t.is_published = TRUE
       AND (a.status IS NULL OR a.status <> 'submitted')
     ORDER BY t.type, t.id ASC`,
    [req.user.id],
  );
  const { rows: activity } = await query(
    `SELECT a.id, a.submitted_at, a.payout_status, t.title, t.type, t.pay_cents
     FROM assignments a
     JOIN tasks t ON t.id = a.task_id
     WHERE a.worker_id = $1 AND a.status = 'submitted'
     ORDER BY a.submitted_at DESC NULLS LAST
     LIMIT 10`,
    [req.user.id],
  );
  res.json({
    ...tierInfo(req.user.tier),
    types: typeRows.map((t) => ({
      ...t,
      pay_dollars: applyTierPay(dollarsFromCents(t.pay_cents), req.user.tier),
    })),
    activity: activity.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      submitted_at: r.submitted_at,
      payout_status: r.payout_status,
      pay_dollars: applyTierPay(dollarsFromCents(r.pay_cents), req.user.tier),
    })),
  });
});
