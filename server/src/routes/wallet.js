import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const walletRouter = Router();
walletRouter.use(requireAuth);

walletRouter.get('/', async (req, res) => {
  const { rows: acct } = await query(
    'SELECT balance, frozen FROM accounts WHERE user_id = $1',
    [req.user.id],
  );
  const { rows: ledger } = await query(
    `SELECT id, kind, amount, ref_type, ref_id, note, created_at
     FROM ledger WHERE user_id = $1 ORDER BY id DESC LIMIT 50`,
    [req.user.id],
  );
  const { rows: withdrawals } = await query(
    `SELECT id, amount, status, method, address, created_at, updated_at
     FROM withdrawals WHERE user_id = $1 ORDER BY id DESC`,
    [req.user.id],
  );
  res.json({
    account: {
      balance: Number(acct[0]?.balance || 0),
      frozen: Number(acct[0]?.frozen || 0),
    },
    ledger: ledger.map((l) => ({ ...l, amount: Number(l.amount) })),
    withdrawals: withdrawals.map((w) => ({ ...w, amount: Number(w.amount) })),
  });
});

walletRouter.post('/withdraw', async (req, res) => {
  if (req.user.role !== 'worker') return res.status(403).json({ error: 'forbidden' });
  const amount = Number(req.body?.amount);
  const address = req.body?.address ? String(req.body.address).trim() : null;
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'invalid amount' });

  try {
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT balance, frozen FROM accounts WHERE user_id = $1 FOR UPDATE',
        [req.user.id],
      );
      const acct = rows[0];
      const available = Number(acct.balance) - Number(acct.frozen);
      if (amount > available) {
        const err = new Error('insufficient funds');
        err.status = 400;
        throw err;
      }
      await client.query(
        'UPDATE accounts SET frozen = frozen + $1 WHERE user_id = $2',
        [amount, req.user.id],
      );
      const { rows: w } = await client.query(
        `INSERT INTO withdrawals (user_id, amount, status, method, address)
         VALUES ($1, $2, 'PENDING', 'demo', $3) RETURNING *`,
        [req.user.id, amount, address],
      );
      await client.query(
        `INSERT INTO ledger (user_id, kind, amount, ref_type, ref_id, note)
         VALUES ($1, 'withdrawal_hold', $2, 'withdrawal', $3, 'Hold for withdrawal')`,
        [req.user.id, amount, w[0].id],
      );
      const { rows: after } = await client.query(
        'SELECT balance, frozen FROM accounts WHERE user_id = $1',
        [req.user.id],
      );
      return {
        withdrawal: { ...w[0], amount: Number(w[0].amount) },
        account: { balance: Number(after[0].balance), frozen: Number(after[0].frozen) },
      };
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'withdraw failed' });
  }
});

export const leadersRouter = Router();
leadersRouter.use(requireAuth);

leadersRouter.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.display_name,
            (u.lifetime_completed + COALESCE(a.n, 0)) AS tasks_done
     FROM users u
     LEFT JOIN (
       SELECT worker_id, COUNT(*)::int AS n
       FROM assignments WHERE status = 'submitted'
       GROUP BY worker_id
     ) a ON a.worker_id = u.id
     WHERE u.role = 'worker'
     ORDER BY tasks_done DESC, u.id ASC
     LIMIT 10`,
  );
  res.json({
    leaders: rows.map((r, i) => ({
      rank: i + 1,
      id: r.id,
      display_name: r.display_name,
      tasks_done: Number(r.tasks_done),
      is_you: r.id === req.user.id,
    })),
  });
});
