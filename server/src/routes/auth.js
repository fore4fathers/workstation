import { Router } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db.js';
import { signToken, publicUser } from '../auth.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const { rows } = await query(
    `SELECT id, email, password_hash, display_name, role, avatar_url, is_active, lifetime_completed
     FROM users WHERE email = $1`,
    [email],
  );
  const user = rows[0];
  if (!user || !user.is_active) return res.status(401).json({ error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });
  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

authRouter.post('/register', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const display_name = String(req.body?.display_name || '').trim();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'valid email required' });
  if (password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });
  if (!display_name) return res.status(400).json({ error: 'display_name required' });

  const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing[0]) return res.status(409).json({ error: 'email already registered' });

  const password_hash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, display_name, role)
     VALUES ($1, $2, $3, 'worker') RETURNING id, email, display_name, role, avatar_url, lifetime_completed`,
    [email, password_hash, display_name],
  );
  const user = rows[0];
  await query(
    'INSERT INTO accounts (user_id, balance, frozen, pending) VALUES ($1, 0, 0, 0)',
    [user.id],
  );
  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

export const meRouter = Router();

meRouter.get('/', requireAuth, async (req, res) => {
  const stats = await workerStats(req.user.id, req.user.lifetime_completed);
  const { rows: acct } = await query(
    'SELECT balance, frozen, pending FROM accounts WHERE user_id = $1',
    [req.user.id],
  );
  res.json({
    user: publicUser(req.user),
    account: {
      balance: Number(acct[0]?.balance || 0),
      frozen: Number(acct[0]?.frozen || 0),
      pending: Number(acct[0]?.pending || 0),
    },
    stats,
  });
});

meRouter.patch('/', requireAuth, async (req, res) => {
  const display_name = String(req.body?.display_name || '').trim();
  if (!display_name) return res.status(400).json({ error: 'display_name required' });
  const { rows } = await query(
    'UPDATE users SET display_name = $1 WHERE id = $2 RETURNING id, email, display_name, role, avatar_url, lifetime_completed',
    [display_name, req.user.id],
  );
  res.json({ user: publicUser(rows[0]) });
});

export async function workerStats(userId, lifetimeCompleted = 0) {
  const { rows: doneRows } = await query(
    `SELECT COUNT(*)::int AS n FROM assignments WHERE worker_id = $1 AND status = 'submitted'`,
    [userId],
  );
  const { rows: accRows } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE s.is_correct IS NOT NULL)::int AS graded,
       COUNT(*) FILTER (WHERE s.is_correct = TRUE)::int AS correct
     FROM submissions s
     JOIN assignments a ON a.id = s.assignment_id
     WHERE a.worker_id = $1`,
    [userId],
  );
  const liveDone = doneRows[0]?.n || 0;
  const tasksDone = liveDone + Number(lifetimeCompleted || 0);
  const graded = accRows[0]?.graded || 0;
  const correct = accRows[0]?.correct || 0;
  const accuracy = graded > 0 ? Math.round((correct / graded) * 100) : (lifetimeCompleted > 0 ? 98 : 0);

  const { rows: rankRows } = await query(
    `SELECT u.id,
            (u.lifetime_completed + COALESCE(a.n, 0)) AS score
     FROM users u
     LEFT JOIN (
       SELECT worker_id, COUNT(*)::int AS n
       FROM assignments WHERE status = 'submitted'
       GROUP BY worker_id
     ) a ON a.worker_id = u.id
     WHERE u.role = 'worker'
     ORDER BY score DESC, u.id ASC`,
  );
  const total = rankRows.length || 1;
  const idx = rankRows.findIndex((r) => r.id === userId);
  const rank = idx >= 0 ? idx + 1 : total;
  const rankPct = Math.max(1, Math.round((rank / total) * 100));
  return { tasks_done: tasksDone, accuracy, rank, rank_pct: rankPct, total_workers: total };
}
