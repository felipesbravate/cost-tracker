import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Vault, memoryStores } from '../src/lib/vault.js';
import { replaceMonth } from '../src/lib/replace-month.js';

const mk = () => { const s = memoryStores(); return new Vault({ master: { active: 'v1', keys: { v1: randomBytes(32) } }, keys: s.keys, docs: s.docs }); };
const e = (o) => ({ year: '2026', monthIndex: 8, type: 'expense', group: 'Variable', category: 'Food', item: 'Lunch', description: 'Imported', amount: 10, ...o });

test('replaces only imported entries of that month; manual entries and other months are kept', async () => {
  const v = mk();
  await v.add('u', 'entries', e({ amount: 90 }));                                   // stale imported cell
  await v.add('u', 'entries', e({ item: 'Gone', amount: 5 }));                       // no longer in the sheet
  await v.add('u', 'entries', e({ description: 'Coffee', amount: 3 }));              // added by hand in the app
  await v.add('u', 'entries', e({ monthIndex: 7, amount: 77 }));                     // another month
  const patch = { year: '2026', monthIndex: 8, entries: [e({ amount: 104.39, note: '- a\n- b', realAmounts: [100, 4.39] }), e({ item: 'New', amount: 1 })] };
  const dry = await replaceMonth(v, 'u', patch, { dryRun: true });
  assert.deepEqual(dry, { existing: 2, incoming: 2, changedOrNew: 2, noLongerInSheet: 1, written: 0, removed: 0 });
  assert.equal((await v.list('u', 'entries')).length, 4, 'dry run writes nothing');
  const r = await replaceMonth(v, 'u', patch);
  assert.equal(r.written, 2); assert.equal(r.removed, 2);
  const all = (await v.list('u', 'entries')).map((d) => d.data);
  assert.equal(all.length, 4);
  assert.ok(all.find((d) => d.description === 'Coffee' && d.amount === 3), 'manual entry kept');
  assert.ok(all.find((d) => d.monthIndex === 7 && d.amount === 77), 'other month kept');
  const lunch = all.find((d) => d.item === 'Lunch' && d.monthIndex === 8 && d.description === 'Imported');
  assert.equal(lunch.amount, 104.39); assert.deepEqual(lunch.realAmounts, [100, 4.39]);
  assert.ok(!all.find((d) => d.item === 'Gone'));
  const again = await replaceMonth(v, 'u', patch, { dryRun: true });
  assert.equal(again.changedOrNew, 0, 're-running finds nothing to change');
});
test('rejects patches that could touch anything else', async () => {
  const v = mk();
  await assert.rejects(replaceMonth(v, 'u', { year: '2026', monthIndex: 8, entries: [e({ description: 'Manual' })] }), /Imported/);
  await assert.rejects(replaceMonth(v, 'u', { year: '2026', monthIndex: 8, entries: [e({ monthIndex: 3 })] }), /Imported/);
  await assert.rejects(replaceMonth(v, 'u', { year: 'x', monthIndex: 8, entries: [] }), /patch must be/);
});
