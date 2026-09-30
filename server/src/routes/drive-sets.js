import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { dollarsFromCents } from '../auth.js';

const COMMISSION_CENTS_DEFAULT = 50;
const CIVITAI_PROMPT_FILTER = `nsfw_level = 'None' AND NULLIF(BTRIM(prompt), '') IS NOT NULL`;

async function isCivitaiBackedTask(taskId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE payload->>'image_url' ILIKE '%picsum.photos%')::int AS demo_count
     FROM task_items WHERE task_id = $1`,
    [taskId],
  );
  return rows[0].total > 0 && rows[0].total === rows[0].demo_count;
}

async function getCivitaiItems(limit) {
  const [images, prompts] = await Promise.all([
    query(`SELECT civitai_id, prompt FROM images WHERE ${CIVITAI_PROMPT_FILTER} ORDER BY id LIMIT $1`, [limit]),
    query(`SELECT DISTINCT BTRIM(prompt) AS prompt FROM images WHERE ${CIVITAI_PROMPT_FILTER} ORDER BY prompt`),
  ]);
  const captions = prompts.rows.map((row) => row.prompt);
  return images.rows.map((row) => ({
    id: row.civitai_id,
    payload: {
      image_url: `/api/civitai/images/${row.civitai_id}`,
      gold: row.prompt.trim(),
      labels: captions,
    },
  }));
}

async function getSetItems(set) {
  if (set.civitai_backed) return getCivitaiItems(set.total_items);
  const { rows } = await query(
    'SELECT id, payload FROM task_items WHERE task_id = $1 ORDER BY sort_order, id LIMIT $2',
    [set.task_id, set.total_items],
  );
  return rows;
}

export const driveSetsRouter = Router();
driveSetsRouter.use(requireAuth);

driveSetsRouter.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT ds.*, t.title, t.type, t.pay_cents,
            COUNT(ic.id)::int AS answered_count,
            COUNT(ic.id) FILTER (WHERE ic.response_type = 'best_match')::int AS best_match_count,
            COUNT(ic.id) FILTER (WHERE ic.response_type = 'alternative_match')::int AS alternative_match_count,
            COUNT(ic.id) FILTER (WHERE ic.response_type = 'foreign_language')::int AS foreign_language_count,
            COALESCE(SUM(ic.commission_cents), 0)::int AS total_commission
     FROM drive_sets ds
     JOIN tasks t ON t.id = ds.task_id
     LEFT JOIN image_commissions ic ON ic.drive_set_id = ds.id
     WHERE ds.user_id = $1 AND ds.status <> 'cancelled'
     GROUP BY ds.id, t.id
     ORDER BY ds.assigned_at DESC`,
    [req.user.id],
  );
  const driveSets = await Promise.all(rows.map(async (row) => {
    const civitaiBacked = await isCivitaiBackedTask(row.task_id);
    return {
      ...row,
      title: civitaiBacked ? 'Civitai Image Caption Training' : row.title,
      civitai_backed: civitaiBacked,
      foreign_commission_cents: Number(row.commission_cents ?? COMMISSION_CENTS_DEFAULT),
      best_match_count: Number(row.best_match_count || 0),
      pay_dollars: dollarsFromCents(row.pay_cents),
    };
  }));
  res.json({ drive_sets: driveSets });
});

async function getOwnedSet(setId, userId) {
  const { rows } = await query(
    `SELECT ds.*, t.title,
            COUNT(ic.id)::int AS answered_count,
            COUNT(ic.id) FILTER (WHERE ic.response_type = 'best_match')::int AS best_match_count,
            COUNT(ic.id) FILTER (WHERE ic.response_type = 'alternative_match')::int AS alternative_match_count,
            COUNT(ic.id) FILTER (WHERE ic.response_type = 'foreign_language')::int AS foreign_language_count,
            COALESCE(SUM(ic.commission_cents), 0)::int AS total_commission
     FROM drive_sets ds
     JOIN tasks t ON t.id = ds.task_id
     LEFT JOIN image_commissions ic ON ic.drive_set_id = ds.id
     WHERE ds.id = $1 AND ds.user_id = $2 AND ds.status <> 'cancelled'
     GROUP BY ds.id, t.id`,
    [setId, userId],
  );
  if (!rows[0]) return null;
  const civitaiBacked = await isCivitaiBackedTask(rows[0].task_id);
  return {
    ...rows[0],
    title: civitaiBacked ? 'Civitai Image Caption Training' : rows[0].title,
    civitai_backed: civitaiBacked,
    foreign_commission_cents: Number(rows[0].commission_cents ?? COMMISSION_CENTS_DEFAULT),
    best_match_count: Number(rows[0].best_match_count || 0),
  };
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function buildOptions(payload, seed) {
  const gold = String(payload?.gold || '');
  if (!gold) return [];
  const candidates = [...new Set([...(payload?.labels || payload?.intents || []), gold]
    .map((label) => String(label).trim()).filter(Boolean))];
  const distractors = candidates.filter((label) => label !== gold)
    .sort((a, b) => stableHash(`${seed}:${a}`) - stableHash(`${seed}:${b}`)).slice(0, 3);
  return [gold, ...distractors]
    .sort((a, b) => stableHash(`${seed}:option:${a}`) - stableHash(`${seed}:option:${b}`));
}

driveSetsRouter.get('/:id/items', async (req, res) => {
  const set = await getOwnedSet(req.params.id, req.user.id);
  if (!set) return res.status(404).json({ error: 'drive set not found' });
  const rows = await getSetItems(set);
  const { rows: answers } = await query(
    'SELECT image_index, selected_label, response_type, commission_cents FROM image_commissions WHERE drive_set_id = $1',
    [set.id],
  );
  const answeredByIndex = new Map(answers.map((answer) => [Number(answer.image_index), answer]));
  res.json({
    drive_set: set,
    items: rows.map((row, index) => {
      const answer = answeredByIndex.get(index);
      return {
        item_id: row.id,
        image_index: index,
        image_url: row.payload?.image_url || row.payload?.imageUrl || row.payload?.url || row.payload?.src || '',
        options: buildOptions(row.payload, `${set.id}:${index}`),
        selected_label: answer?.selected_label ?? null,
        response_type: answer?.response_type ?? null,
        commission_cents: Number(answer?.commission_cents || 0),
      };
    }),
  });
});

driveSetsRouter.post('/answer', async (req, res) => {
  const driveSetId = Number(req.body?.drive_set_id);
  const imageIndex = Number(req.body?.image_index);
  const selectedLabel = String(req.body?.selected_label || '');
  const responseType = req.body?.response_type === 'foreign_language'
    ? 'foreign_language'
    : 'caption_match';
  if (!driveSetId || !Number.isInteger(imageIndex) || imageIndex < 0 || !selectedLabel.trim() || selectedLabel.length > 4000) {
    return res.status(400).json({ error: 'drive_set_id, image_index, and a response under 4000 characters are required' });
  }

  const result = await withTransaction(async (client) => {
    const { rows: sets } = await client.query(
      'SELECT * FROM drive_sets WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [driveSetId, req.user.id],
    );
    const set = sets[0];
    if (!set) return { status: 404, body: { error: 'drive set not found' } };
    if (set.status !== 'active') return { status: 400, body: { error: 'drive set not active' } };
    if (imageIndex >= set.total_items) return { status: 400, body: { error: 'image index out of range' } };

    const trainingSet = { ...set, civitai_backed: await isCivitaiBackedTask(set.task_id) };
    const setItems = await getSetItems(trainingSet);
    const item = setItems[imageIndex];
    if (!item) return { status: 404, body: { error: 'image not found' } };
    const options = buildOptions(item.payload, `${set.id}:${imageIndex}`);
    if (responseType !== 'foreign_language' && !options.includes(selectedLabel)) {
      return { status: 400, body: { error: 'invalid caption option' } };
    }

    const bestMatch = responseType !== 'foreign_language'
      && selectedLabel === String(item.payload?.gold || '');
    const storedResponseType = responseType === 'foreign_language'
      ? 'foreign_language'
      : bestMatch ? 'best_match' : 'alternative_match';
    const commissionCents = responseType === 'foreign_language'
      ? Number(set.commission_cents ?? COMMISSION_CENTS_DEFAULT)
      : bestMatch
        ? Number(set.commission_cents ?? COMMISSION_CENTS_DEFAULT)
        : Number(set.alternative_commission_cents ?? 25);
    const { rows: priorRows } = await client.query(
      'SELECT commission_cents FROM image_commissions WHERE drive_set_id = $1 AND image_index = $2 FOR UPDATE',
      [set.id, imageIndex],
    );
    const previousCents = Number(priorRows[0]?.commission_cents || 0);
    const balanceDelta = (commissionCents - previousCents) / 100;

    await client.query(
      `INSERT INTO image_commissions
         (user_id, task_id, drive_set_id, image_index, selected_label, is_correct, commission_cents, response_type, answered_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (drive_set_id, image_index) DO UPDATE SET
         selected_label = EXCLUDED.selected_label, is_correct = EXCLUDED.is_correct,
         commission_cents = EXCLUDED.commission_cents, response_type = EXCLUDED.response_type,
         answered_at = NOW()`,
      [req.user.id, set.task_id, set.id, imageIndex, selectedLabel.trim(), bestMatch, commissionCents, storedResponseType],
    );
    if (balanceDelta) {
      await client.query('UPDATE accounts SET balance = balance + $1 WHERE user_id = $2', [balanceDelta, req.user.id]);
    }
    const { rows: progress } = await client.query(
      `SELECT COUNT(*)::int AS answered_count,
              COUNT(*) FILTER (WHERE response_type = 'best_match')::int AS best_match_count,
              COUNT(*) FILTER (WHERE response_type = 'alternative_match')::int AS alternative_match_count,
              COUNT(*) FILTER (WHERE response_type = 'foreign_language')::int AS foreign_language_count,
              COALESCE(SUM(commission_cents), 0)::int AS total_commission
       FROM image_commissions WHERE drive_set_id = $1`,
      [set.id],
    );
    return { status: 200, body: {
      response_type: storedResponseType,
      commission_cents: commissionCents,
      ...progress[0],
    } };
  });
  res.status(result.status).json(result.body);
});

driveSetsRouter.post('/:id/complete', async (req, res) => {
  const result = await withTransaction(async (client) => {
    const { rows: sets } = await client.query(
      'SELECT * FROM drive_sets WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [req.params.id, req.user.id],
    );
    const set = sets[0];
    if (!set) return { status: 404, body: { error: 'drive set not found' } };
    const { rows: answered } = await client.query(
      'SELECT COUNT(*)::int AS n FROM image_commissions WHERE drive_set_id = $1', [set.id],
    );
    if (answered[0].n < set.total_items) {
      return { status: 400, body: { error: 'answer every image before completing the set', answered_count: answered[0].n } };
    }
    await client.query(
      `UPDATE drive_sets SET status = 'completed', completed_at = COALESCE(completed_at, NOW()) WHERE id = $1`,
      [set.id],
    );
    return { status: 200, body: { completed: true } };
  });
  res.status(result.status).json(result.body);
});
