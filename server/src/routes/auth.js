import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { query } from '../db.js';
import { signToken, publicUser } from '../auth.js';
import { tierInfo } from '../tiers.js';
import { requireAuth } from '../middleware/requireAuth.js';

const ACCESS_CODES = new Set(['AW-BETA', 'LABEL-2026']);

function issueCode() {
  return String(crypto.randomInt(100000, 1000000));
}

async function saveCode(userId) {
  const code = issueCode();
  await query(
    `UPDATE users SET verification_code = $1, verification_expires = NOW() + INTERVAL '15 minutes'
     WHERE id = $2`,
    [code, userId],
  );
  return code;
}

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const { rows } = await query(
    `SELECT id, email, password_hash, display_name, role, avatar_url, is_active, lifetime_completed, tier, phone, created_at, email_verified
     FROM users WHERE email = $1`,
    [email],
  );
  const user = rows[0];
  if (!user || !user.is_active) return res.status(401).json({ error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });
  if (user.email_verified === false) {
    return res.status(403).json({
      error: 'Please verify your email',
      requiresVerification: true,
      email: user.email,
    });
  }
  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

authRouter.post('/register', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const first = String(req.body?.first_name || '').trim();
  const last = String(req.body?.last_name || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const access = String(req.body?.access_code || '').trim().toUpperCase();
  const display_name = String(req.body?.display_name || `${first} ${last}`.trim()).trim();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'valid email required' });
  if (password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });
  if (!display_name) return res.status(400).json({ error: 'name required' });
  if (!ACCESS_CODES.has(access)) return res.status(400).json({ error: 'invalid access code' });

  const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing[0]) return res.status(409).json({ error: 'email already registered' });

  const password_hash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, display_name, role, tier, phone, email_verified)
     VALUES ($1, $2, $3, 'worker', 2, $4, FALSE) RETURNING id, email`,
    [email, password_hash, display_name, phone || null],
  );
  const user = rows[0];
  await query(
    'INSERT INTO accounts (user_id, balance, frozen, pending) VALUES ($1, 0, 0, 0)',
    [user.id],
  );
  const dev_code = await saveCode(user.id);
  res.status(201).json({ needs_verification: true, email: user.email, dev_code });
});

authRouter.post('/verify-email', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || '').trim();
  if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'valid email and 6-digit code required' });
  const { rows } = await query(
    `SELECT id, verification_code, verification_expires, email_verified FROM users WHERE email = $1`,
    [email],
  );
  const user = rows[0];
  if (!user) return res.status(404).json({ error: 'not found' });
  if (user.email_verified) return res.json({ ok: true, already: true });
  if (!user.verification_code || user.verification_code !== code) {
    return res.status(400).json({ error: 'incorrect verification code' });
  }
  if (user.verification_expires && new Date(user.verification_expires) < new Date()) {
    return res.status(400).json({ error: 'code expired' });
  }
  const { rows: updated } = await query(
    `UPDATE users SET email_verified = TRUE, verification_code = NULL, verification_expires = NULL
     WHERE id = $1 RETURNING id, email, display_name, role, avatar_url, lifetime_completed, tier, phone, created_at`,
    [user.id],
  );
  const token = signToken(updated[0]);
  res.json({ ok: true, token, user: publicUser(updated[0]) });
});

authRouter.post('/resend-code', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const { rows } = await query(
    `SELECT id, email_verified FROM users WHERE email = $1`,
    [email],
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  if (rows[0].email_verified) return res.json({ ok: true, already: true });
  const dev_code = await saveCode(rows[0].id);
  res.json({ ok: true, email, dev_code });
});

authRouter.post('/forgot', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const { rows } = await query('SELECT id FROM users WHERE email = $1 AND is_active = TRUE', [email]);
  if (!rows[0]) return res.json({ ok: true });
  const dev_code = await saveCode(rows[0].id);
  res.json({ ok: true, email, dev_code });
});

authRouter.post('/reset', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || '').trim();
  const password = String(req.body?.password || '');
  if (password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });
  const { rows } = await query(
    `SELECT id, verification_code, verification_expires FROM users WHERE email = $1`,
    [email],
  );
  const user = rows[0];
  if (!user || user.verification_code !== code) return res.status(400).json({ error: 'incorrect code' });
  if (user.verification_expires && new Date(user.verification_expires) < new Date()) {
    return res.status(400).json({ error: 'code expired' });
  }
  const password_hash = await bcrypt.hash(password, 10);
  await query(
    `UPDATE users SET password_hash = $1, verification_code = NULL, verification_expires = NULL WHERE id = $2`,
    [password_hash, user.id],
  );
  res.json({ ok: true });
});

export const meRouter = Router();

meRouter.get('/', requireAuth, async (req, res) => {
  const stats = await workerStats(req.user.id, req.user.lifetime_completed);
  const { rows: acct } = await query(
    'SELECT balance, frozen, pending FROM accounts WHERE user_id = $1',
    [req.user.id],
  );
  const { rows: earn } = await query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE kind = 'task_payout'), 0) AS total_earned,
       COALESCE(SUM(amount) FILTER (WHERE kind = 'task_payout' AND created_at >= NOW() - INTERVAL '7 days'), 0) AS week_earned,
       COALESCE(SUM(amount) FILTER (WHERE kind = 'checkin_bonus'), 0) AS welcome_credit
     FROM ledger WHERE user_id = $1`,
    [req.user.id],
  );
  res.json({
    user: { ...publicUser(req.user), ...tierInfo(req.user.tier) },
    account: {
      balance: Number(acct[0]?.balance || 0),
      frozen: Number(acct[0]?.frozen || 0),
      pending: Number(acct[0]?.pending || 0),
    },
    stats: {
      ...stats,
      week_earned: Number(earn[0]?.week_earned || 0),
      total_earned: Number(earn[0]?.total_earned || 0),
      welcome_credit: Number(earn[0]?.welcome_credit || 0),
    },
  });
});

meRouter.patch('/', requireAuth, async (req, res) => {
  const display_name = String(req.body?.display_name || '').trim();
  if (!display_name) return res.status(400).json({ error: 'display_name required' });
  const phone = req.body?.phone != null ? String(req.body.phone).trim() : req.user.phone;
  const { rows } = await query(
    `UPDATE users SET display_name = $1, phone = $2 WHERE id = $3
     RETURNING id, email, display_name, role, avatar_url, lifetime_completed, tier, phone, created_at`,
    [display_name, phone || null, req.user.id],
  );
  res.json({ user: publicUser(rows[0]) });
});

meRouter.post('/password', requireAuth, async (req, res) => {
  const current = String(req.body?.current || '');
  const next = String(req.body?.next || '');
  if (next.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });
  const ok = await bcrypt.compare(current, req.user.password_hash);
  if (!ok) return res.status(401).json({ error: 'current password is wrong' });
  const password_hash = await bcrypt.hash(next, 10);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, req.user.id]);
  res.json({ ok: true });
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
