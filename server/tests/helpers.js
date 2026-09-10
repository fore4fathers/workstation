import { createHttpServer } from '../src/index.js';
import { seed } from '../src/sql/seed.js';
import { query } from '../src/db.js';

export async function resetDemo() {
  await seed({ reset: true });
}

export async function withServer(fn) {
  const server = createHttpServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await fn(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

export async function req(port, path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, body: data };
}

export async function login(port, email, password) {
  const res = await req(port, '/api/auth/login', { method: 'POST', body: { email, password } });
  if (res.status !== 200) throw new Error(`login failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function getBalance(userId) {
  const { rows } = await query(
    'SELECT balance, frozen, pending FROM accounts WHERE user_id = $1',
    [userId],
  );
  return {
    balance: Number(rows[0].balance),
    frozen: Number(rows[0].frozen),
    pending: Number(rows[0].pending || 0),
  };
}
