import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getBalance, login, req, resetDemo, withServer } from './helpers.js';

before(async () => {
  await resetDemo();
});

describe('auth', () => {
  it('logs in john and blocks admin routes', async () => {
    await withServer(async (port) => {
      const res = await req(port, '/api/auth/login', {
        method: 'POST',
        body: { email: 'john@demo.local', password: 'john123' },
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.user.role, 'worker');
      assert.ok(res.body.token);

      const bad = await req(port, '/api/auth/login', {
        method: 'POST',
        body: { email: 'john@demo.local', password: 'nope' },
      });
      assert.equal(bad.status, 401);

      const forbidden = await req(port, '/api/admin/stats', { token: res.body.token });
      assert.equal(forbidden.status, 403);

      const me = await req(port, '/api/me', { token: res.body.token });
      assert.equal(me.status, 200);
      assert.equal(Math.round(me.body.account.balance * 10) / 10, 189.9);
      assert.equal(me.body.stats.tasks_done, 142);
      assert.equal(me.body.stats.accuracy, 98);
    });
  });
});

describe('tasks', () => {
  it('hides gold labels from workers', async () => {
    await withServer(async (port) => {
      const admin = await login(port, 'admin@demo.local', 'admin123');
      const worker = await login(port, 'john@demo.local', 'john123');
      const created = await req(port, '/api/admin/tasks', {
        method: 'POST',
        token: admin.token,
        body: {
          type: 'intent',
          title: 'Extra intents',
          description: 'demo',
          pay_cents: 50,
          est_minutes: 3,
          items: [
            { utterance: 'book me a seat', intents: ['book_flight', 'cancel', 'other'], gold: 'book_flight' },
            { utterance: 'hello there', intents: ['book_flight', 'cancel', 'other'], gold: 'other' },
          ],
        },
      });
      assert.equal(created.status, 201);
      const id = created.body.task.id;
      const list = await req(port, '/api/tasks', { token: worker.token });
      assert.equal(list.status, 200);
      assert.ok(list.body.tasks.some((t) => t.id === id));
      const detail = await req(port, `/api/tasks/${id}`, { token: worker.token });
      assert.equal(detail.body.items.length, 2);
      assert.equal(detail.body.items[0].payload.utterance, 'book me a seat');
      assert.equal(detail.body.items[0].payload.gold, undefined);
    });
  });
});

describe('payout and wallet', () => {
  it('pays once then freeze/approve/reject', async () => {
    await withServer(async (port) => {
      const admin = await login(port, 'admin@demo.local', 'admin123');
      const john = await login(port, 'john@demo.local', 'john123');
      const created = await req(port, '/api/admin/tasks', {
        method: 'POST',
        token: admin.token,
        body: {
          type: 'text',
          title: 'Pay once',
          pay_cents: 85,
          items: [{ text: 'hello', labels: ['positive', 'negative'], gold: 'positive' }],
        },
      });
      const taskId = created.body.task.id;
      const itemId = created.body.items[0].id;
      const before = await getBalance(john.user.id);
      const start = await req(port, `/api/tasks/${taskId}/start`, { method: 'POST', token: john.token });
      assert.equal(start.status, 200);
      const submitted = await req(port, `/api/tasks/${taskId}/submit`, {
        method: 'POST',
        token: john.token,
        body: { answers: [{ item_id: itemId, answer: 'positive' }] },
      });
      assert.equal(submitted.status, 200);
      const afterSubmit = await getBalance(john.user.id);
      assert.equal(afterSubmit.balance, before.balance);
      assert.equal(Number((afterSubmit.pending - before.pending).toFixed(2)), 0.85);

      const tooSoon = await req(port, '/api/wallet/withdraw', {
        method: 'POST',
        token: john.token,
        body: { amount: before.balance + 0.5 },
      });
      assert.equal(tooSoon.status, 400);

      const released = await req(port, `/api/admin/payouts/${submitted.body.assignment_id}/release`, {
        method: 'POST',
        token: admin.token,
      });
      assert.equal(released.status, 200);
      const after = await getBalance(john.user.id);
      assert.equal(Number((after.balance - before.balance).toFixed(2)), 0.85);
      assert.equal(after.pending, before.pending);
      const again = await req(port, `/api/tasks/${taskId}/submit`, {
        method: 'POST',
        token: john.token,
        body: { answers: [{ item_id: itemId, answer: 'positive' }] },
      });
      assert.equal(again.status, 409);

      const over = await req(port, '/api/wallet/withdraw', {
        method: 'POST', token: john.token, body: { amount: 99999 },
      });
      assert.equal(over.status, 400);

      const hold = await req(port, '/api/wallet/withdraw', {
        method: 'POST', token: john.token, body: { amount: 10, address: 'demo' },
      });
      assert.equal(hold.status, 200);
      const afterHold = await getBalance(john.user.id);
      const approved = await req(port, `/api/admin/withdrawals/${hold.body.withdrawal.id}/approve`, {
        method: 'POST', token: admin.token,
      });
      assert.equal(approved.status, 200);
      const afterApprove = await getBalance(john.user.id);
      assert.equal(Number((afterApprove.balance - (afterHold.balance - 10)).toFixed(2)), 0);

      const hold2 = await req(port, '/api/wallet/withdraw', {
        method: 'POST', token: john.token, body: { amount: 5 },
      });
      const beforeReject = await getBalance(john.user.id);
      const rejected = await req(port, `/api/admin/withdrawals/${hold2.body.withdrawal.id}/reject`, {
        method: 'POST', token: admin.token,
      });
      assert.equal(rejected.status, 200);
      const afterReject = await getBalance(john.user.id);
      assert.equal(afterReject.balance, beforeReject.balance);
      assert.equal(Number((afterReject.frozen - (beforeReject.frozen - 5)).toFixed(2)), 0);
    });
  });
});

describe('register and disable', () => {
  it('signs up a worker and lets admin disable them', async () => {
    await withServer(async (port) => {
      const created = await req(port, '/api/auth/register', {
        method: 'POST',
        body: { email: 'new@demo.local', password: 'password1', display_name: 'Newt' },
      });
      assert.equal(created.status, 201);
      assert.equal(created.body.user.role, 'worker');
      const me = await req(port, '/api/me', { token: created.body.token });
      assert.equal(me.status, 200);
      assert.equal(me.body.account.balance, 0);
      assert.equal(me.body.account.pending, 0);

      const dup = await req(port, '/api/auth/register', {
        method: 'POST',
        body: { email: 'new@demo.local', password: 'password1', display_name: 'Newt' },
      });
      assert.equal(dup.status, 409);

      const admin = await login(port, 'admin@demo.local', 'admin123');
      const workers = await req(port, '/api/admin/workers', { token: admin.token });
      assert.equal(workers.status, 200);
      const row = workers.body.workers.find((w) => w.email === 'new@demo.local');
      assert.ok(row);
      const off = await req(port, `/api/admin/workers/${row.id}/active`, {
        method: 'POST',
        token: admin.token,
        body: { is_active: false },
      });
      assert.equal(off.status, 200);
      const blocked = await req(port, '/api/auth/login', {
        method: 'POST',
        body: { email: 'new@demo.local', password: 'password1' },
      });
      assert.equal(blocked.status, 401);
    });
  });
});

describe('payout void', () => {
  it('voids pending earnings so they never become available', async () => {
    await withServer(async (port) => {
      const admin = await login(port, 'admin@demo.local', 'admin123');
      const john = await login(port, 'john@demo.local', 'john123');
      const created = await req(port, '/api/admin/tasks', {
        method: 'POST',
        token: admin.token,
        body: {
          type: 'text',
          title: 'Void me',
          pay_cents: 200,
          items: [{ text: 'hello', labels: ['positive', 'negative'], gold: 'positive' }],
        },
      });
      const taskId = created.body.task.id;
      const itemId = created.body.items[0].id;
      const before = await getBalance(john.user.id);
      const submitted = await req(port, `/api/tasks/${taskId}/submit`, {
        method: 'POST',
        token: john.token,
        body: { answers: [{ item_id: itemId, answer: 'positive' }] },
      });
      assert.equal(submitted.status, 200);
      const voided = await req(port, `/api/admin/payouts/${submitted.body.assignment_id}/void`, {
        method: 'POST',
        token: admin.token,
      });
      assert.equal(voided.status, 200);
      const after = await getBalance(john.user.id);
      assert.equal(after.balance, before.balance);
      assert.equal(after.pending, before.pending);
    });
  });
});

describe('chat', () => {
  it('threads john and admin', async () => {
    await withServer(async (port) => {
      const john = await login(port, 'john@demo.local', 'john123');
      const admin = await login(port, 'admin@demo.local', 'admin123');
      const thread = await req(port, '/api/chat', { token: john.token });
      assert.equal(thread.status, 200);
      const sent = await req(port, '/api/chat', { method: 'POST', token: john.token, body: { content: 'hi' } });
      assert.equal(sent.status, 201);
      const inbox = await req(port, '/api/admin/chat', { token: admin.token });
      assert.ok(inbox.body.conversations.some((c) => c.last_message === 'hi'));
      const convId = inbox.body.conversations.find((c) => c.worker_id === john.user.id).id;
      const reply = await req(port, `/api/admin/chat/${convId}`, {
        method: 'POST', token: admin.token, body: { content: 'hello john' },
      });
      assert.equal(reply.status, 201);
      const again = await req(port, '/api/chat', { token: john.token });
      assert.deepEqual(again.body.messages.map((m) => m.content), ['hi', 'hello john']);
    });
  });
});
