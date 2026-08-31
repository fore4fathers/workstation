import jwt from 'jsonwebtoken';
import { config } from './config.js';

export function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    config.jwtSecret,
    { expiresIn: '7d' },
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    role: row.role,
    avatar_url: row.avatar_url,
    lifetime_completed: row.lifetime_completed || 0,
  };
}

export function publicItem(payload) {
  const copy = { ...(payload || {}) };
  delete copy.gold;
  return copy;
}

export function dollarsFromCents(cents) {
  return Number(cents || 0) / 100;
}

export function money(value) {
  return Number(value || 0);
}
