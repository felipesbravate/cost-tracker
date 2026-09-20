import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { handle, memoryProfiles, memoryUsage } from '../src/lib/api.js';
import { Vault, memoryStores } from '../src/lib/vault.js';
import { RateLimiter, parseAdminEmails, passesCsrf, effectiveStatus } from '../src/lib/security.js';

const ORIGIN = 'https://app.test';
function setup(cap = 3) {
  const s = memoryStores();
  const calls = [];
  const deps = {
    vault: new Vault({ master: { active: 'v1', keys: { v1: randomBytes(32) } }, keys: s.keys, docs: s.docs }),
    profiles: memoryProfiles(), usage: memoryUsage(),
    ai: { async complete(a) { calls.push(a); return '{"ok":true}'; } },
    admins: parseAdminEmails('Boss@Example.com'), appOrigin: ORIGIN,
    limiter: new RateLimiter(100, 60000), dailyReadCap: cap,
  };
  const call = (method, path, user, body, extra = {}) => handle({
    method, path, user, body,
    headers: { 'x-requested-with': 'costs-tracker', origin: ORIGIN, ...extra },
  }, deps);
  return { deps, call, calls, s };
}
const boss = { id: 'u-boss', email: 'boss@example.com' };
const ann = { id: 'u-ann', email: 'ann@example.com' };
const bob = { id: 'u-bob', email: 'bob@example.com' };

test('anonymous -> 401; cross-site write -> 403', async () => {
  const { call, deps } = setup();
  assert.equal((await call('GET', '/api/db/entries', null)).status, 401);
  const r = await handle({ method: 'POST', path: '/api/db/entries', user: boss, body: {}, headers: { origin: 'https://evil.test', 'x-requested-with': 'costs-tracker' } }, deps);
  assert.equal(r.status, 403);
  const r2 = await handle({ method: 'POST', path: '/api/db/entries', user: boss, body: {}, headers: { origin: ORIGIN } }, deps);
  assert.equal(r2.status, 403);
});

test('new users are pending: no data access until an admin approves', async () => {
  const { call } = setup();
  assert.equal((await call('GET', '/api/me', ann)).body.status, 'pending');
  assert.equal((await call('GET', '/api/db/entries', ann)).status, 403);
  assert.equal((await call('POST', '/api/db/entries', ann, { a: 1 })).status, 403);
  assert.equal((await call('GET', '/api/admin/users', ann)).status, 403);
  assert.equal((await call('POST', '/api/admin/users/u-ann/approve', ann)).status, 403);
  // Admin approves
  assert.equal((await call('GET', '/api/me', boss)).body.status, 'approved');
  assert.equal((await call('POST', '/api/admin/users/u-ann/approve', boss)).status, 200);
  assert.equal((await call('GET', '/api/db/entries', ann)).status, 200);
  assert.equal((await call('POST', '/api/admin/users/u-ann/block', boss)).status, 200);
  assert.equal((await call('GET', '/api/db/entries', ann)).status, 403);
});

test('users only ever see their own documents', async () => {
  const { call } = setup();
  await call('GET', '/api/me', ann); await call('GET', '/api/me', bob);
  await call('POST', '/api/admin/users/u-ann/approve', boss); await call('POST', '/api/admin/users/u-bob/approve', boss);
  const a = await call('POST', '/api/db/entries', ann, { amount: 1, item: 'ann-secret' });
  assert.equal(a.status, 201);
  assert.equal((await call('GET', '/api/db/entries', bob)).body.docs.length, 0);
  assert.equal((await call('DELETE', `/api/db/entries/${a.body.id}`, bob)).status, 200); // no-op for bob
  assert.equal((await call('GET', '/api/db/entries', ann)).body.docs.length, 1);
  assert.equal((await call('PUT', `/api/db/entries/${a.body.id}`, ann, { amount: 2 })).status, 200);
  assert.equal((await call('GET', '/api/db/entries', ann)).body.docs[0].data.amount, 2);
});

test('bad collection and ids are 400; internals are not leaked', async () => {
  const { call } = setup();
  assert.equal((await call('GET', '/api/db/secrets', boss)).status, 400);
  assert.equal((await call('POST', '/api/db/entries', boss, [1])).status, 400);
  assert.equal((await call('GET', '/api/nothing', boss)).status, 404);
});

test('read-document: validates, caps daily use, and never stores the receipt', async () => {
  const { call, calls, s } = setup(2);
  assert.equal((await call('POST', '/api/read-document', boss, { prompt: '' })).status, 400);
  assert.equal((await call('POST', '/api/read-document', boss, { prompt: 'x', images: [{ mediaType: 'image/svg+xml', data: 'a' }] })).status, 400);
  assert.equal((await call('POST', '/api/read-document', boss, { prompt: 'x', images: Array(7).fill({ mediaType: 'image/png', data: 'a' }) })).status, 400);
  assert.equal((await call('POST', '/api/read-document', boss, { prompt: 'RECEIPT-TEXT' })).status, 200);
  assert.equal((await call('POST', '/api/read-document', boss, { prompt: 'again' })).status, 200);
  assert.equal((await call('POST', '/api/read-document', boss, { prompt: 'third' })).status, 429);
  assert.equal(calls.length, 2);
  assert.ok(![...s.docMap.values()].some((r) => JSON.stringify(r).includes('RECEIPT-TEXT')));
});

test('erase removes data and blocks the account', async () => {
  const { call } = setup();
  await call('POST', '/api/db/entries', boss, { a: 1 });
  assert.equal((await call('DELETE', '/api/me', boss)).status, 200);
});

test('helpers', () => {
  assert.equal(passesCsrf({ method: 'GET', headers: {} }, ORIGIN), true);
  assert.equal(passesCsrf({ method: 'POST', headers: { 'x-requested-with': 'costs-tracker', 'sec-fetch-site': 'cross-site' } }, ORIGIN), false);
  assert.equal(effectiveStatus({ email: 'BOSS@example.com' }, parseAdminEmails('boss@example.com')), 'approved');
  assert.equal(effectiveStatus({ email: 'x@y.z', status: 'blocked' }, new Set()), 'blocked');
  const l = new RateLimiter(2, 1000);
  assert.deepEqual([l.take('k', 0), l.take('k', 1), l.take('k', 2), l.take('k', 1001)], [true, true, false, true]);
});

test('doc ids produced by the app (with . : @ + ~) are accepted; traversal-ish ids are not', async () => {
  const { call } = setup();
  const id = 'budgetDefaults__expense__Fixed__Habitation__Rent-or-mortgage.v1~a:b@c+d';
  assert.equal((await call('PUT', `/api/db/budgetDefaults/${id}`, boss, { amount: 1 })).status, 200);
  assert.equal((await call('PUT', '/api/db/budgetDefaults/..', boss, { amount: 1 })).status, 400);
  assert.equal((await call('PUT', `/api/db/budgetDefaults/${'a'.repeat(201)}`, boss, { amount: 1 })).status, 400);
  assert.equal((await call('PUT', '/api/db/budgetDefaults/a%2Fb', boss, { amount: 1 })).status, 400);
});

test('percent-encoded ids (as sent by the browser) are decoded before validation', async () => {
  const { call } = setup();
  const raw = 'budgetDefaults__expense__Fixed__Rent-or-mortgage.v1~a:b@c+d';
  assert.equal((await call('PUT', `/api/db/budgetDefaults/${encodeURIComponent(raw)}`, boss, { amount: 1 })).status, 200);
  const list = (await call('GET', '/api/db/budgetDefaults', boss)).body.docs;
  assert.equal(list[0].id, raw);
  assert.equal((await call('DELETE', `/api/db/budgetDefaults/${encodeURIComponent(raw)}`, boss)).status, 200);
  assert.equal((await call('GET', '/api/db/budgetDefaults', boss)).body.docs.length, 0);
  assert.equal((await call('PUT', '/api/db/budgetDefaults/%E0%A4%A', boss, { a: 1 })).status, 400);
});
