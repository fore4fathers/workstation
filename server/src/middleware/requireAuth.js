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
    const { rows } = await query(
      `SELECT id, email, display_name, role, avatar_url, is_active, lifetime_completed
       FROM users WHERE id = $1`,
      [payload.id],
    );
    if (!rows[0] || !rows[0].is_active) return res.status(401).json({ error: 'unauthorized' });
    req.user = rows[0];
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}
