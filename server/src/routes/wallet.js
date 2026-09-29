import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { DEPOSIT_METHODS, WITHDRAW_METHODS, methodToCrypto } from '../tiers.js';

export const walletRouter = Router();
walletRouter.use(requireAuth);

walletRouter.get('/', async (req, res) => {
  const { rows: acct } = await query(
    'SELECT balance, frozen, pending FROM accounts WHERE user_id = $1',
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
  const { rows: deposits } = await query(
    `SELECT id, amount, status, method, tx_ref, created_at, updated_at
     FROM deposits WHERE user_id = $1 ORDER BY id DESC`,
    [req.user.id],
  );
  const { rows: addresses } = await query(
    `SELECT id, cryptocurrency, network, address, label, is_default, created_at
     FROM user_wallet_addresses WHERE user_id = $1 ORDER BY id ASC`,
    [req.user.id],
  );
  res.json({
    account: {
      balance: Number(acct[0]?.balance || 0),
      frozen: Number(acct[0]?.frozen || 0),
      pending: Number(acct[0]?.pending || 0),
    },
    ledger: ledger.map((l) => ({ ...l, amount: Number(l.amount) })),
    withdrawals: withdrawals.map((w) => ({ ...w, amount: Number(w.amount) })),
    deposits: deposits.map((d) => ({ ...d, amount: Number(d.amount) })),
    addresses,
    methods: WITHDRAW_METHODS,
  });
});

walletRouter.post('/deposit', async (req, res) => {
  if (req.user.role !== 'worker') return res.status(403).json({ error: 'forbidden' });
  const amount = Number(req.body?.amount);
  const method = String(req.body?.method || 'demo');
  const tx_ref = req.body?.tx_ref ? String(req.body.tx_ref).trim() : null;
  const notes = req.body?.notes ? String(req.body.notes).trim() : null;
  const details = req.body?.details && typeof req.body.details === 'object' ? req.body.details : null;
  if (!Number.isFinite(amount) || amount < 10) return res.status(400).json({ error: 'minimum deposit is 10' });
  if (!DEPOSIT_METHODS.includes(method)) return res.status(400).json({ error: 'invalid method' });
  const { rows } = await query(
    `INSERT INTO deposits (user_id, amount, status, method, tx_ref, notes, details)
     VALUES ($1, $2, 'PENDING', $3, $4, $5, $6) RETURNING *`,
    [req.user.id, amount, method, tx_ref, notes, details],
  );
  res.status(201).json({ deposit: { ...rows[0], amount: Number(rows[0].amount) } });
});

walletRouter.get('/pay-in-addresses', async (_req, res) => {
  const { rows } = await query(
    `SELECT cryptocurrency, network, address FROM platform_deposit_addresses ORDER BY cryptocurrency, network`,
  );
  res.json({ addresses: rows });
});

walletRouter.get('/addresses', async (req, res) => {
  const { rows } = await query(
    `SELECT id, cryptocurrency, network, address, label, is_default, created_at
     FROM user_wallet_addresses WHERE user_id = $1 ORDER BY id ASC`,
    [req.user.id],
  );
  res.json({ addresses: rows });
});

walletRouter.post('/addresses', async (req, res) => {
  if (req.user.role !== 'worker') return res.status(403).json({ error: 'forbidden' });
  const cryptocurrency = String(req.body?.cryptocurrency || '').toUpperCase();
  const network = String(req.body?.network || '').toUpperCase();
  const address = String(req.body?.address || '').trim();
  const label = req.body?.label ? String(req.body.label).trim() : null;
  if (!address) return res.status(400).json({ error: 'address required' });
  const { rows: map } = await query(
    'SELECT 1 FROM cryptocurrency_networks WHERE cryptocurrency = $1 AND network = $2',
    [cryptocurrency, network],
  );
  if (!map[0]) return res.status(400).json({ error: 'unsupported crypto/network' });
  const { rows } = await query(
    `INSERT INTO user_wallet_addresses (user_id, cryptocurrency, network, address, label, is_default)
     VALUES ($1,$2,$3,$4,$5, NOT EXISTS (
       SELECT 1 FROM user_wallet_addresses u
       WHERE u.user_id = $1 AND u.cryptocurrency = $2 AND u.network = $3
     ))
     RETURNING *`,
    [req.user.id, cryptocurrency, network, address, label],
  );
  res.status(201).json({ address: rows[0] });
});

walletRouter.post('/withdraw', async (req, res) => {
  if (req.user.role !== 'worker') return res.status(403).json({ error: 'forbidden' });
  const amount = Number(req.body?.amount);
  const method = String(req.body?.method || 'demo');
  let address = req.body?.address ? String(req.body.address).trim() : null;
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'invalid amount' });
  if (!WITHDRAW_METHODS.includes(method)) return res.status(400).json({ error: 'invalid method' });
  const crypto = methodToCrypto(method);
  if (crypto) {
    if (req.body?.address_id) {
      const { rows: addr } = await query(
        `SELECT address FROM user_wallet_addresses
         WHERE id = $1 AND user_id = $2 AND cryptocurrency = $3 AND network = $4`,
        [req.body.address_id, req.user.id, crypto.cryptocurrency, crypto.network],
      );
      if (!addr[0]) return res.status(400).json({ error: 'saved address required' });
      address = addr[0].address;
    } else if (!address) {
      const { rows: addr } = await query(
        `SELECT address FROM user_wallet_addresses
         WHERE user_id = $1 AND cryptocurrency = $2 AND network = $3
         ORDER BY is_default DESC, id ASC LIMIT 1`,
        [req.user.id, crypto.cryptocurrency, crypto.network],
      );
      if (!addr[0]) return res.status(400).json({ error: 'saved address required' });
      address = addr[0].address;
    }
  }

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
         VALUES ($1, $2, 'PENDING', $3, $4) RETURNING *`,
        [req.user.id, amount, method, address],
      );
      await client.query(
        `INSERT INTO ledger (user_id, kind, amount, ref_type, ref_id, note)
         VALUES ($1, 'withdrawal_hold', $2, 'withdrawal', $3, 'Hold for withdrawal')`,
        [req.user.id, amount, w[0].id],
      );
      const { rows: after } = await client.query(
        'SELECT balance, frozen, pending FROM accounts WHERE user_id = $1',
        [req.user.id],
      );
      return {
        withdrawal: { ...w[0], amount: Number(w[0].amount) },
        account: {
          balance: Number(after[0].balance),
          frozen: Number(after[0].frozen),
          pending: Number(after[0].pending),
        },
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
