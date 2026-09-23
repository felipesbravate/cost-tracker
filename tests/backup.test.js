import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Vault, memoryStores } from '../src/lib/vault.js';
import { buildSnapshot, verifySnapshot, restoreUser, keyFingerprint } from '../src/lib/backup.js';

const master = { active: 'v1', keys: { v1: randomBytes(32) } };
const snapOf = (s) => buildSnapshot({
  users: [{ id: 'old-u', email: 'ann@example.com', created_at: 't' }], profiles: [{ user_id: 'old-u', email: 'ann@example.com', status: 'approved' }],
  userKeys: [...s.keyMap.entries()].map(([u, r]) => ({ user_id: u, kek_version: r.kekVersion, wrapped: r.wrapped })),
  documents: [...s.docMap.values()], source: 'old.supabase.co', fingerprint: keyFingerprint('K'), now: 'NOW',
});

test('snapshot -> verify -> restore into another user id (new project) keeps every document readable', async () => {
  const a = memoryStores(); const va = new Vault({ master, keys: a.keys, docs: a.docs });
  await va.set('old-u', 'years', 'y2026', { year: '2026', currency: 'EUR' });
  const ids = await va.addMany('old-u', 'entries', [{ item: 'Rent', amount: 900 }, { item: 'Lunch', amount: 12.5 }]);
  const snap = JSON.parse(JSON.stringify(snapOf(a)));
  assert.deepEqual(snap.counts.byCollection, { years: 1, entries: 2 });
  assert.equal(snap.format, 'costs-tracker-backup/1');
  const v = verifySnapshot(snap, master);
  assert.deepEqual([v.ok, v.documents, v.failures.length], [true, 3, 0]);

  const b = memoryStores(); const vb = new Vault({ master, keys: b.keys, docs: b.docs });
  const dry = await restoreUser(snap, master, vb, { fromUserId: 'old-u', toUserId: 'new-u', dryRun: true });
  assert.deepEqual([dry.restored, b.docMap.size], [0, 0]);
  const r = await restoreUser(snap, master, vb, { fromUserId: 'old-u', toUserId: 'new-u' });
  assert.equal(r.restored, 3);
  const entries = await vb.list('new-u', 'entries');
  assert.deepEqual(entries.map((e) => e.id).sort(), ids.sort());
  assert.deepEqual(entries.map((e) => e.data.item).sort(), ['Lunch', 'Rent']);
  await restoreUser(snap, master, vb, { fromUserId: 'old-u', toUserId: 'new-u' });
  assert.equal((await vb.list('new-u', 'entries')).length, 2, 're-running overwrites, no duplicates');
});

test('verify catches a wrong master key and tampered rows', async () => {
  const a = memoryStores(); const va = new Vault({ master, keys: a.keys, docs: a.docs });
  await va.addMany('old-u', 'entries', [{ item: 'Rent' }]);
  const snap = JSON.parse(JSON.stringify(snapOf(a)));
  assert.equal(verifySnapshot(snap, { active: 'v1', keys: { v1: randomBytes(32) } }).ok, false);
  snap.documents[0].doc_id = 'moved';
  const v = verifySnapshot(snap, master);
  assert.equal(v.ok, false); assert.equal(v.failures[0].error, 'decrypt failed');
  assert.throws(() => verifySnapshot({ format: 'x' }, master), /unknown format/);
});
