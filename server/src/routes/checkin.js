import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { performDailyCheckin } from '../checkin.js';

export const checkinRouter = Router();
checkinRouter.use(requireAuth);

checkinRouter.get('/stats', async (req, res) => {
  const { rows: stats } = await query(
    `SELECT total_checkins, current_streak, longest_streak, last_checkin_date
     FROM user_checkin_stats WHERE user_id = $1`,
    [req.user.id],
  );
  const { rows: recent } = await query(
    `SELECT checkin_date, bonus, streak_day
     FROM daily_checkins WHERE user_id = $1
     ORDER BY checkin_date DESC LIMIT 42`,
    [req.user.id],
  );
  const today = recent[0] && String(recent[0].checkin_date).slice(0, 10) === new Date().toISOString().slice(0, 10);
  res.json({
    total_checkins: Number(stats[0]?.total_checkins || 0),
    current_streak: Number(stats[0]?.current_streak || 0),
    longest_streak: Number(stats[0]?.longest_streak || 0),
    last_checkin_date: stats[0]?.last_checkin_date || null,
    checked_in_today: Boolean(today) || (stats[0]?.last_checkin_date && String(stats[0].last_checkin_date).slice(0, 10) === new Date().toISOString().slice(0, 10)),
    recent: recent.map((r) => ({
      date: r.checkin_date,
      bonus: Number(r.bonus),
      streak_day: r.streak_day,
    })),
  });
});

checkinRouter.get('/calendar/:year/:month', async (req, res) => {
  const year = Number(req.params.year);
  const month = Number(req.params.month);
  if (!year || month < 1 || month > 12) return res.status(400).json({ error: 'invalid month' });
  const { rows } = await query(
    `SELECT checkin_date, bonus, streak_day
     FROM daily_checkins
     WHERE user_id = $1
       AND EXTRACT(YEAR FROM checkin_date) = $2
       AND EXTRACT(MONTH FROM checkin_date) = $3
     ORDER BY checkin_date`,
    [req.user.id, year, month],
  );
  res.json({ year, month, checkins: rows });
});

checkinRouter.post('/', async (req, res) => {
  if (req.user.role !== 'worker') return res.status(403).json({ error: 'forbidden' });
  try {
    const result = await performDailyCheckin(req.user.id);
    if (result.already) return res.status(409).json({ error: 'already checked in today', ...result });
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'check-in failed' });
  }
});
