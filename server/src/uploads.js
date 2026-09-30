import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

const IMAGE_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

export function saveImageUpload({ name, mime, data }, directory = config.uploadDir) {
  const ext = IMAGE_EXT[String(mime || '').toLowerCase()]
    || IMAGE_EXT[`image/${path.extname(String(name || '')).slice(1).toLowerCase()}`]
    || null;
  if (!ext) {
    const err = new Error('images only (jpg, png, gif, webp)');
    err.status = 400;
    throw err;
  }
  const raw = String(data || '');
  const b64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) {
    const err = new Error('empty file');
    err.status = 400;
    throw err;
  }
  if (buf.length > 5 * 1024 * 1024) {
    const err = new Error('file too large (5MB)');
    err.status = 400;
    throw err;
  }
  fs.mkdirSync(directory, { recursive: true });
  const filename = `${crypto.randomBytes(16).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(directory, filename), buf);
  return { filename, url: `/uploads/${filename}`, name: name || filename };
}
