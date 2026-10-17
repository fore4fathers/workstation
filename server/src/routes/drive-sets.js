import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { dollarsFromCents } from '../auth.js';

const COMMISSION_CENTS_DEFAULT = 50;
const CIVITAI_PROMPT_FILTER = `type = 'image' AND nsfw_level = 'None' AND NULLIF(BTRIM(prompt), '') IS NOT NULL`;

async function isCivitaiBackedTask(taskId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE payload->>'image_url' ILIKE '%picsum.photos%')::int AS picsum_count
     FROM task_items WHERE task_id = $1`,
    [taskId],
  );
  return rows[0].total > 0 && rows[0].total === rows[0].picsum_count;
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

export async function getSetItems(set) {
  const { rows: existing } = await query(
    'SELECT id, source_item_id, image_index, sort_order, payload, bonus_cents FROM drive_set_items WHERE drive_set_id = $1 ORDER BY sort_order, id',
    [set.id],
  );
  if (existing.length < Number(set.total_items)) {
    const missingCount = Number(set.total_items) - existing.length;
    let sourceItems;
    if (set.civitai_backed) sourceItems = await getCivitaiItems(set.total_items);
    else {
      const { rows } = await query(
        'SELECT id, payload FROM task_items WHERE task_id = $1 ORDER BY sort_order, id LIMIT $2',
        [set.task_id, set.total_items],
      );
      sourceItems = rows;
    }
    const occupiedIndexes = new Set(existing.map((item) => Number(item.image_index)));
    const occupiedOrders = new Set(existing.map((item) => Number(item.sort_order)));
    const candidates = sourceItems.map((item, index) => ({ ...item, sourceIndex: index }))
      .filter((item) => !occupiedIndexes.has(item.sourceIndex) && !occupiedOrders.has(item.sourceIndex))
      .slice(0, missingCount);
    for (const item of candidates) {
      await query(
        `INSERT INTO drive_set_items (drive_set_id, source_item_id, image_index, sort_order, payload)
         VALUES ($1, $2, $3, $3, $4) ON CONFLICT DO NOTHING`,
        [set.id, set.civitai_backed ? null : item.id, item.sourceIndex, item.payload],
      );
    }
  }
  const { rows } = await query(
    'SELECT id, source_item_id, image_index, sort_order, payload, bonus_cents FROM drive_set_items WHERE drive_set_id = $1 ORDER BY sort_order, id',
    [set.id],
  );
  if (rows.length) {
    await query(
      `UPDATE image_commissions c SET drive_set_item_id = i.id
       FROM drive_set_items i
       WHERE c.drive_set_id = $1 AND i.drive_set_id = c.drive_set_id
         AND i.image_index = c.image_index AND c.drive_set_item_id IS NULL`,
      [set.id],
    );
  }
  return rows;
}

async function getBundleProgress(setId, items) {
  const { rows } = await query(
    'SELECT drive_set_item_id, component_index, response_type, commission_cents FROM image_commissions WHERE drive_set_id = $1',
    [setId],
  );
  const answers = new Map();
  for (const row of rows) {
    const list = answers.get(Number(row.drive_set_item_id)) || [];
    list.push(row);
    answers.set(Number(row.drive_set_item_id), list);
  }
  return {
    answered_count: items.filter((item) => {
      const count = Array.isArray(item.payload?.merge_products) && item.payload.merge_products.length > 1
        ? item.payload.merge_products.length : 1;
      return (answers.get(Number(item.id)) || []).length >= count;
    }).length,
    best_match_count: rows.filter((row) => row.response_type === 'best_match').length,
    alternative_match_count: rows.filter((row) => row.response_type === 'alternative_match').length,
    foreign_language_count: rows.filter((row) => row.response_type === 'foreign_language').length,
    total_commission: rows.reduce((sum, row) => sum + Number(row.commission_cents || 0), 0),
  };
}

function bundleExpectedPayoutCents(set, item, componentCount) {
  return (Number(set.commission_cents ?? COMMISSION_CENTS_DEFAULT) * componentCount)
    + Number(item.bonus_cents || 0);
}

async function refreshBalanceGate(set, items, answeredByItem) {
  const currentItem = items.find((item) => {
    const count = Array.isArray(item.payload?.merge_products) && item.payload.merge_products.length > 1
      ? item.payload.merge_products.length : 1;
    return Object.keys(answeredByItem.get(Number(item.id)) || {}).length < count;
  });
  const products = Array.isArray(currentItem?.payload?.merge_products) && currentItem.payload.merge_products.length > 1
    ? currentItem.payload.merge_products : [];
  if (!currentItem || products.length < 2) {
    await query(
      `UPDATE drive_sets SET balance_blocked_at = NULL, balance_blocked_item_id = NULL,
         balance_required_cents = NULL, balance_available_cents = NULL WHERE id = $1`,
      [set.id],
    );
    return { blocked: false };
  }

  const { rows } = await query('SELECT balance, frozen FROM accounts WHERE user_id = $1', [set.user_id]);
  const account = rows[0] || { balance: 0, frozen: 0 };
  const availableCents = Math.max(0, Math.round((Number(account.balance || 0) - Number(account.frozen || 0)) * 100));
  const requiredCents = bundleExpectedPayoutCents(set, currentItem, products.length);
  const blocked = availableCents < requiredCents;
  await query(
    `UPDATE drive_sets SET balance_blocked_at = CASE WHEN $2::boolean THEN COALESCE(balance_blocked_at, NOW()) ELSE NULL END,
       balance_blocked_item_id = CASE WHEN $2::boolean THEN $3::integer ELSE NULL::integer END,
       balance_required_cents = CASE WHEN $2::boolean THEN $4::integer ELSE NULL::integer END,
       balance_available_cents = CASE WHEN $2::boolean THEN $5::integer ELSE NULL::integer END
     WHERE id = $1`,
    [set.id, blocked, currentItem.id, requiredCents, availableCents],
  );
  return {
    blocked,
    item_id: blocked ? Number(currentItem.id) : null,
    required_cents: requiredCents,
    available_cents: availableCents,
    deficit_cents: Math.max(0, requiredCents - availableCents),
  };
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
    const items = await getSetItems({ ...row, civitai_backed: civitaiBacked });
    const progress = await getBundleProgress(row.id, items);
    return {
      ...row,
      ...progress,
      title: civitaiBacked ? 'Civitai Image Caption Labeling' : row.title,
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
    title: civitaiBacked ? 'Civitai Image Caption Labeling' : rows[0].title,
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
    'SELECT drive_set_item_id, component_index, selected_label, response_type, commission_cents FROM image_commissions WHERE drive_set_id = $1',
    [set.id],
  );
  const answeredByItem = new Map();
  for (const answer of answers) {
    const entries = answeredByItem.get(Number(answer.drive_set_item_id)) || {};
    entries[Number(answer.component_index)] = answer;
    answeredByItem.set(Number(answer.drive_set_item_id), entries);
  }
  const progress = await getBundleProgress(set.id, rows);
  const balanceGate = await refreshBalanceGate(set, rows, answeredByItem);
  res.json({
    drive_set: { ...set, ...progress, balance_gate: balanceGate },
    items: rows.map((row) => {
      const componentAnswers = answeredByItem.get(Number(row.id)) || {};
      const products = Array.isArray(row.payload?.merge_products) && row.payload.merge_products.length > 1
        ? row.payload.merge_products
        : [{ ...row.payload, title: row.payload?.product_title || row.payload?.title || 'Product', image_url: row.payload?.image_url }];
      const components = products.map((product, componentIndex) => {
        const answer = componentAnswers[componentIndex];
        const sourcePayload = { ...row.payload, ...product };
        const rootTranslations = row.payload.translations?.ar || {};
        const translations = product.translations?.ar
          || rootTranslations.merge_products?.[componentIndex]
          || rootTranslations;
        const choices = buildOptions(sourcePayload, `${set.id}:${row.image_index}:${componentIndex}`);
        const sourceChoices = sourcePayload.labels || sourcePayload.intents || [];
        return {
          component_index: componentIndex,
          title: product.title || product.product_title || `Product ${componentIndex + 1}`,
          translations: { ar: translations },
          image_url: product.image_url || row.payload?.image_url || '',
          options: choices,
          option_translations: choices.map((option) => {
            if (option === String(sourcePayload.gold || '')) return translations.gold || translations.labels?.[sourceChoices.indexOf(option)] || option;
            const optionIndex = sourceChoices.indexOf(option);
            return (translations.labels || translations.intents)?.[optionIndex] || option;
          }),
          selected_label: answer?.selected_label ?? null,
          response_type: answer?.response_type ?? null,
          commission_cents: Number(answer?.commission_cents || 0),
        };
      });
      const complete = components.every((component) => component.selected_label != null);
      const baseAnswer = componentAnswers[0];
      return {
        item_id: row.id,
        drive_set_item_id: row.id,
        image_index: row.image_index,
        sort_order: row.sort_order,
        bonus_cents: row.bonus_cents,
        payload: row.payload,
        merge_products: products.length > 1 ? products : null,
        is_bundle: products.length > 1,
        component_count: components.length,
        components,
        image_url: row.payload?.image_url || row.payload?.imageUrl || row.payload?.url || row.payload?.src || '',
        options: components[0]?.options || [],
        selected_label: complete ? (components.at(-1)?.selected_label ?? baseAnswer?.selected_label ?? null) : null,
        response_type: components.at(-1)?.response_type ?? baseAnswer?.response_type ?? null,
        commission_cents: components.reduce((sum, component) => sum + component.commission_cents, 0),
      };
    }),
  });
});

driveSetsRouter.post('/answer', async (req, res) => {
  const driveSetId = Number(req.body?.drive_set_id);
  const imageIndex = Number(req.body?.image_index);
  const driveSetItemId = Number(req.body?.drive_set_item_id);
  const componentIndex = Number(req.body?.component_index ?? 0);
  const selectedLabel = String(req.body?.selected_label || '');
  const responseType = req.body?.response_type === 'foreign_language'
    ? 'foreign_language'
    : 'caption_match';
  if (!driveSetId || (!Number.isInteger(driveSetItemId) && (!Number.isInteger(imageIndex) || imageIndex < 0))
      || !Number.isInteger(componentIndex) || componentIndex < 0 || !selectedLabel.trim() || selectedLabel.length > 4000) {
    return res.status(400).json({ error: 'drive_set_id, item position, and a response under 4000 characters are required' });
  }

  const result = await withTransaction(async (client) => {
    const { rows: sets } = await client.query(
      'SELECT * FROM drive_sets WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [driveSetId, req.user.id],
    );
    const set = sets[0];
    if (!set) return { status: 404, body: { error: 'drive set not found' } };
    if (set.status !== 'active') return { status: 400, body: { error: 'drive set not active' } };
    const resolvedSet = { ...set, civitai_backed: await isCivitaiBackedTask(set.task_id) };
    const setItems = await getSetItems(resolvedSet);
    const item = Number.isInteger(driveSetItemId)
      ? setItems.find((row) => Number(row.id) === driveSetItemId)
      : setItems.find((row) => Number(row.image_index) === imageIndex);
    if (!item) return { status: 404, body: { error: 'image not found' } };
    if (Number(item.sort_order) >= Number(set.total_items)) return { status: 400, body: { error: 'image index out of range' } };
    const products = Array.isArray(item.payload?.merge_products) && item.payload.merge_products.length > 1
      ? item.payload.merge_products
      : [{ ...item.payload, title: item.payload?.product_title || item.payload?.title || 'Product', image_url: item.payload?.image_url }];
    if (componentIndex >= products.length) return { status: 400, body: { error: 'bundle position out of range' } };
    if (products.length > 1) {
      const { rows: accounts } = await client.query('SELECT balance, frozen FROM accounts WHERE user_id = $1 FOR UPDATE', [req.user.id]);
      const account = accounts[0] || { balance: 0, frozen: 0 };
      const availableCents = Math.max(0, Math.round((Number(account.balance || 0) - Number(account.frozen || 0)) * 100));
      const requiredCents = bundleExpectedPayoutCents(set, item, products.length);
      if (availableCents < requiredCents) {
        await client.query(
          `UPDATE drive_sets SET balance_blocked_at = COALESCE(balance_blocked_at, NOW()),
             balance_blocked_item_id = $2, balance_required_cents = $3, balance_available_cents = $4 WHERE id = $1`,
          [set.id, item.id, requiredCents, availableCents],
        );
        return { status: 402, body: {
          error: 'wallet balance is insufficient to continue with this bundle',
          balance_gate: { blocked: true, item_id: Number(item.id), required_cents: requiredCents,
            available_cents: availableCents, deficit_cents: requiredCents - availableCents },
        } };
      }
      await client.query(
        `UPDATE drive_sets SET balance_blocked_at = NULL, balance_blocked_item_id = NULL,
           balance_required_cents = NULL, balance_available_cents = NULL WHERE id = $1`, [set.id],
      );
    }
    const product = products[componentIndex];
    const sourcePayload = { ...item.payload, ...product };
    const options = buildOptions(sourcePayload, `${set.id}:${item.image_index}:${componentIndex}`);
    if (responseType !== 'foreign_language' && !options.includes(selectedLabel)) {
      return { status: 400, body: { error: 'invalid caption option' } };
    }

    const bestMatch = responseType !== 'foreign_language'
      && selectedLabel === String(sourcePayload?.gold || '');
    const storedResponseType = responseType === 'foreign_language'
      ? 'foreign_language'
      : bestMatch ? 'best_match' : 'alternative_match';
    const baseCommissionCents = responseType === 'foreign_language'
      ? Number(set.commission_cents ?? COMMISSION_CENTS_DEFAULT)
      : bestMatch
        ? Number(set.commission_cents ?? COMMISSION_CENTS_DEFAULT)
        : Number(set.alternative_commission_cents ?? 25);
    const commissionCents = baseCommissionCents + (componentIndex === products.length - 1 ? Number(item.bonus_cents || 0) : 0);
    const { rows: priorRows } = await client.query(
      'SELECT commission_cents FROM image_commissions WHERE drive_set_id = $1 AND drive_set_item_id = $2 AND component_index = $3 FOR UPDATE',
      [set.id, item.id, componentIndex],
    );
    const previousCents = Number(priorRows[0]?.commission_cents || 0);
    const balanceDelta = (commissionCents - previousCents) / 100;

    await client.query(
      `INSERT INTO image_commissions
         (user_id, task_id, drive_set_id, drive_set_item_id, component_index, image_index, selected_label, is_correct, commission_cents, response_type, answered_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (drive_set_id, drive_set_item_id, component_index) DO UPDATE SET
         selected_label = EXCLUDED.selected_label, is_correct = EXCLUDED.is_correct,
         commission_cents = EXCLUDED.commission_cents, response_type = EXCLUDED.response_type,
         answered_at = NOW()`,
      [req.user.id, set.task_id, set.id, item.id, componentIndex, item.image_index, selectedLabel.trim(), bestMatch, commissionCents, storedResponseType],
    );
    if (balanceDelta) {
      await client.query('UPDATE accounts SET balance = balance + $1 WHERE user_id = $2', [balanceDelta, req.user.id]);
    }
    const { rows: progress } = await client.query(
      `SELECT COUNT(DISTINCT i.id) FILTER (WHERE (
                SELECT COUNT(*) FROM image_commissions c WHERE c.drive_set_id = i.drive_set_id AND c.drive_set_item_id = i.id
              ) >= CASE WHEN jsonb_typeof(i.payload->'merge_products') = 'array' AND jsonb_array_length(i.payload->'merge_products') > 1
                        THEN jsonb_array_length(i.payload->'merge_products') ELSE 1 END)::int AS answered_count,
              COUNT(DISTINCT i.id) FILTER (WHERE EXISTS (SELECT 1 FROM image_commissions c WHERE c.drive_set_id = i.drive_set_id AND c.drive_set_item_id = i.id AND c.response_type = 'best_match'))::int AS best_match_count,
              COUNT(DISTINCT i.id) FILTER (WHERE EXISTS (SELECT 1 FROM image_commissions c WHERE c.drive_set_id = i.drive_set_id AND c.drive_set_item_id = i.id AND c.response_type = 'alternative_match'))::int AS alternative_match_count,
              COUNT(DISTINCT i.id) FILTER (WHERE EXISTS (SELECT 1 FROM image_commissions c WHERE c.drive_set_id = i.drive_set_id AND c.drive_set_item_id = i.id AND c.response_type = 'foreign_language'))::int AS foreign_language_count,
              COALESCE(SUM(commission_cents), 0)::int AS total_commission
       FROM drive_set_items i
       LEFT JOIN image_commissions ic ON ic.drive_set_id = i.drive_set_id AND ic.drive_set_item_id = i.id
       WHERE i.drive_set_id = $1 GROUP BY i.drive_set_id`,
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
      `SELECT COUNT(*)::int AS n FROM drive_set_items i
       WHERE i.drive_set_id = $1 AND (
         SELECT COUNT(*) FROM image_commissions c WHERE c.drive_set_id = i.drive_set_id AND c.drive_set_item_id = i.id
       ) >= CASE WHEN jsonb_typeof(i.payload->'merge_products') = 'array' AND jsonb_array_length(i.payload->'merge_products') > 1
                 THEN jsonb_array_length(i.payload->'merge_products') ELSE 1 END`, [set.id],
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
