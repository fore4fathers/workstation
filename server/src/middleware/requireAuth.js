import { verifyToken } from '../auth.js';
import { query } from '../db.js';

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ')
      ? header.slice(7)
      : (req.cookies?.aw_token);
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const payload = verifyToken(token);
    req.auth = payload;
    const { rows } = await query(
      `SELECT id, email, display_name, role, avatar_url, is_active, is_verified, lifetime_completed, tier, phone, created_at, password_hash
       FROM users WHERE id = $1`,
      [payload.id],
    );
    if (!rows[0]) return res.status(401).json({ error: 'unauthorized' });
    req.user = rows[0];
    const inactiveWorker = req.user.role === 'worker' && (!req.user.is_active || !req.user.is_verified);
    const accountCheck = req.baseUrl === '/api/me' && req.method === 'GET' && req.path === '/';
    const supportContact = req.baseUrl === '/api/chat' && req.method === 'GET' && req.path === '/support-contact';
    if (inactiveWorker && !payload.impersonated_by && !accountCheck && !supportContact) {
      return res.status(403).json({ error: 'account awaiting verification', requiresVerification: true });
    }
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}
