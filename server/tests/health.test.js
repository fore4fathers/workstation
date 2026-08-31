import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withServer, req } from './helpers.js';
import { app } from '../src/index.js';
import http from 'node:http';

describe('health', () => {
  it('returns ok', async () => {
    const server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    try {
      const res = await req(port, '/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});
