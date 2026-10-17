import { Pool } from 'pg';
import { config } from '../server/src/config.js';

const authKey = process.env.DEEPL_AUTH_KEY;
if (!authKey) throw new Error('Set DEEPL_AUTH_KEY in the root .env file or environment before running this script.');

const endpoint = authKey.endsWith(':fx')
  ? 'https://api-free.deepl.com/v2/translate'
  : 'https://api.deepl.com/v2/translate';
const overwrite = process.argv.includes('--overwrite');
const pool = new Pool({ connectionString: config.databaseUrl });
const scalarFields = new Set([
  'text', 'utterance', 'title', 'product_title', 'description',
  'recommendation', 'instruction', 'caption', 'prompt', 'context', 'question',
]);
const listFields = new Set(['labels', 'intents', 'recommendations', 'instructions', 'captions', 'choices', 'options']);

function collectText(value, path = [], out = []) {
  if (!value || typeof value !== 'object') return out;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'translations' || key === 'image_url' || key === 'url') continue;
    const childPath = [...path, key];
    if (scalarFields.has(key) && typeof child === 'string' && child.trim()) {
      out.push({ path: childPath, value: child });
    } else if (listFields.has(key) && Array.isArray(child)) {
      child.forEach((entry, index) => {
        if (typeof entry === 'string' && entry.trim()) out.push({ path: [...childPath, String(index)], value: entry });
        else if (entry && typeof entry === 'object') collectText(entry, [...childPath, String(index)], out);
      });
    } else if (child && typeof child === 'object') {
      collectText(child, childPath, out);
    }
  }
  return out;
}

function getPath(root, path) {
  return path.reduce((value, key) => value?.[key], root);
}

function setPath(root, path, value) {
  let current = root;
  for (const key of path.slice(0, -1)) {
    if (!current[key] || typeof current[key] !== 'object') current[key] = /^\d+$/.test(key) ? [] : {};
    current = current[key];
  }
  current[path.at(-1)] = value;
}

async function translate(values) {
  const translated = [];
  for (let start = 0; start < values.length; start += 30) {
    const batch = values.slice(start, start + 30);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${authKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: batch, source_lang: 'EN', target_lang: 'AR', preserve_formatting: true }),
    });
    if (!response.ok) throw new Error(`DeepL request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
    const result = await response.json();
    if (!Array.isArray(result.translations) || result.translations.length !== batch.length) {
      throw new Error('DeepL returned an unexpected translation response.');
    }
    translated.push(...result.translations.map((entry) => entry.text));
  }
  return translated;
}

try {
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}'::jsonb`);
  const jobs = [];
  const { rows: tasks } = await pool.query('SELECT id, title, description, translations FROM tasks ORDER BY id');
  for (const row of tasks) {
    const job = { kind: 'task', row, arabic: { ...(row.translations?.ar || {}) }, paths: [] };
    for (const field of ['title', 'description']) {
      if (row[field] && (overwrite || typeof job.arabic[field] !== 'string')) {
        job.paths.push({ path: [field], value: row[field] });
      }
    }
    if (job.paths.length) jobs.push(job);
  }

  const itemStats = {};
  for (const table of ['task_items', 'assignment_items', 'drive_set_items']) {
    const { rows } = await pool.query(`SELECT id, payload FROM ${table} ORDER BY id`);
    itemStats[table] = { rows: rows.length, updated: 0, strings: 0 };
    for (const row of rows) {
      const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
      const existing = payload.translations?.ar || {};
      const paths = collectText(payload).filter(({ path }) => overwrite || typeof getPath(existing, path) !== 'string');
      if (paths.length) jobs.push({ kind: 'item', table, row, payload, arabic: structuredClone(existing), paths });
    }
  }

  const entries = jobs.flatMap((job) => job.paths.map((entry) => ({ job, ...entry })));
  const uniqueValues = [...new Set(entries.map((entry) => entry.value))];
  const translated = await translate(uniqueValues);
  const translatedBySource = new Map(uniqueValues.map((value, index) => [value, translated[index]]));
  entries.forEach(({ job, path, value }) => setPath(job.arabic, path, translatedBySource.get(value)));

  let taskStrings = 0;
  for (const job of jobs) {
    if (job.kind === 'task') {
      await pool.query('UPDATE tasks SET translations = $1 WHERE id = $2', [
        { ...(job.row.translations || {}), ar: job.arabic }, job.row.id,
      ]);
      taskStrings += job.paths.length;
    } else {
      await pool.query(`UPDATE ${job.table} SET payload = $1 WHERE id = $2`, [
        { ...job.payload, translations: { ...(job.payload.translations || {}), ar: job.arabic } }, job.row.id,
      ]);
      itemStats[job.table].updated += 1;
      itemStats[job.table].strings += job.paths.length;
    }
  }
  console.log(JSON.stringify({
    language: 'ar', overwrite, tasks: { rows: tasks.length, strings: taskStrings },
    items: itemStats, translated_strings: entries.length,
    unique_strings_sent_to_deepl: uniqueValues.length,
  }, null, 2));
} finally {
  await pool.end();
}
