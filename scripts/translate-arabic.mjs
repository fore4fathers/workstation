import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  const envText = await fs.readFile(path.join(root, '.env'), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const authKey = process.env.DEEPL_AUTH_KEY;
if (!authKey) {
  throw new Error('Set DEEPL_AUTH_KEY in the root .env file or environment before running this script.');
}

const endpoint = authKey.endsWith(':fx')
  ? 'https://api-free.deepl.com/v2/translate'
  : 'https://api.deepl.com/v2/translate';
const sourcePath = path.join(root, 'web/src/locales/en.json');
const targetPath = path.join(root, 'web/src/locales/ar.json');
const overwrite = process.argv.includes('--overwrite');
const source = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
let target = {};
try {
  target = JSON.parse(await fs.readFile(targetPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const entries = Object.entries(source).filter(([key, value]) => (
  typeof value === 'string' && value.trim() && (overwrite || !target[key])
));
if (!entries.length) {
  console.log('No untranslated English catalog entries found.');
  process.exit(0);
}

const batchSize = 30;
function protectPlaceholders(value) {
  const placeholders = [];
  const protectedText = value.replace(/\{[^{}]+\}/g, (placeholder) => {
    const token = `ZXQPLACEHOLDER${placeholders.length}QXZ`;
    placeholders.push([token, placeholder]);
    return token;
  });
  return { protectedText, placeholders };
}

for (let start = 0; start < entries.length; start += batchSize) {
  const batch = entries.slice(start, start + batchSize);
  const protectedValues = batch.map(([, value]) => protectPlaceholders(value));
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${authKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: protectedValues.map(({ protectedText }) => protectedText),
      source_lang: 'EN',
      target_lang: 'AR',
      preserve_formatting: true,
    }),
  });

  if (!response.ok) {
    const message = (await response.text()).slice(0, 500);
    throw new Error(`DeepL request failed (${response.status}): ${message}`);
  }
  const result = await response.json();
  if (!Array.isArray(result.translations) || result.translations.length !== batch.length) {
    throw new Error('DeepL returned an unexpected translation response.');
  }
  batch.forEach(([key], index) => {
    let translated = result.translations[index].text;
    for (const [token, placeholder] of protectedValues[index].placeholders) {
      translated = translated.replaceAll(token, placeholder);
    }
    target[key] = translated;
  });
}

await fs.writeFile(targetPath, `${JSON.stringify(target, null, 2)}\n`);
console.log(`Translated ${entries.length} catalog strings to Arabic and wrote ${path.relative(root, targetPath)}.`);
