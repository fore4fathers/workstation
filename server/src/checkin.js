import { query } from './db.js';

export const CHECKIN_BONUS = 0.1;

export async function performDailyCheckin(userId, client = null, { award = true } = {}) {
  const run = (sql, params) => (client ? client.query(sql, params) : query(sql, params));
  const { rows: today } = await run(
    `SELECT id FROM daily_checkins WHERE user_id = $1 AND checkin_date = CURRENT_DATE`,
    [userId],
  );
  if (today[0]) return { success: false, already: true };

  const { rows: last } = await run(
    `SELECT last_checkin_date, current_streak, longest_streak, total_checkins
     FROM user_checkin_stats WHERE user_id = $1`,
    [userId],
  );
  let streak = 1;
  const prev = last[0];
  if (prev?.last_checkin_date) {
    const d = new Date(prev.last_checkin_date);
    const yesterday = new Date();
    yesterday.setHours(0, 0, 0, 0);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastDay = new Date(d);
    lastDay.setHours(0, 0, 0, 0);
    if (lastDay.getTime() === yesterday.getTime()) streak = Number(prev.current_streak || 0) + 1;
  }
  const total = Number(prev?.total_checkins || 0) + 1;
  const longest = Math.max(Number(prev?.longest_streak || 0), streak);

  await run(
    `INSERT INTO daily_checkins (user_id, checkin_date, bonus, streak_day)
     VALUES ($1, CURRENT_DATE, $2, $3)`,
    [userId, award ? CHECKIN_BONUS : 0, streak],
  );
  await run(
    `INSERT INTO user_checkin_stats (user_id, total_checkins, current_streak, longest_streak, last_checkin_date)
     VALUES ($1, $2, $3, $4, CURRENT_DATE)
     ON CONFLICT (user_id) DO UPDATE SET
       total_checkins = $2,
       current_streak = $3,
       longest_streak = $4,
       last_checkin_date = CURRENT_DATE`,
    [userId, total, streak, longest],
  );
  let bonus = 0;
  if (award) {
    bonus = CHECKIN_BONUS;
    await run(
      `UPDATE accounts SET balance = balance + $1 WHERE user_id = $2`,
      [bonus, userId],
    );
    await run(
      `INSERT INTO ledger (user_id, kind, amount, ref_type, note)
       VALUES ($1, 'checkin_bonus', $2, 'checkin', $3)`,
      [userId, bonus, `Day ${streak} check-in`],
    );
  }
  return { success: true, already: false, streak, bonus, total, longest };
}
