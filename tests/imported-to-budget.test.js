import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Vault, memoryStores } from '../src/lib/vault.js';
import { importedToBudget } from '../src/lib/imported-to-budget.js';

const mk = () => { const s = memoryStores(); return new Vault({ master: { active: 'v1', keys: { v1: randomBytes(32) } }, keys: s.keys, docs: s.docs }); };
const e = (o) => ({ year: '2026', monthIndex: 9, type: 'expense', group: 'Variable', category: 'Food', item: 'Groceries', description: 'Imported', amount: 300, ...o });

test('imported entries of the chosen months become that month\'s budget; app entries and other months stay', async () => {
  const v = mk();
  await v.add('u', 'entries', e());                                               // Oct, becomes budget
  await v.add('u', 'entries', e({ amount: 20 }));                                 // same item twice -> summed
  await v.add('u', 'entries', e({ monthIndex: 10, item: 'Rent', group: 'Fixed', category: 'Habitation', amount: 900 })); // Nov
  await v.add('u', 'entries', e({ type: 'income', group: null, category: null, item: 'Salary', amount: 3000 }));         // income too
  await v.add('u', 'entries', e({ description: 'Mercadona', amount: 12 }));      // added in the app: kept
  await v.add('u', 'entries', e({ monthIndex: 8, amount: 50 }));                  // September: kept
  await v.add('u', 'budgets', { year: '2026', type: 'expense', group: 'Fixed', category: 'Habitation', item: 'Internet', amount: 40 }); // starting budget
  const dry = await importedToBudget(v, 'u', { year: '2026', months: [9, 10, 11] }, { dryRun: true });
  assert.equal(dry.totals.entriesToRemove, 4);
  assert.equal((await v.list('u', 'entries')).length, 6, 'dry run writes nothing');
  await importedToBudget(v, 'u', { year: '2026', months: [9, 10, 11] });
  const entries = (await v.list('u', 'entries')).map((d) => d.data);
  assert.deepEqual(entries.map((x) => [x.monthIndex, x.description]).sort(), [[8, 'Imported'], [9, 'Mercadona']]);
  const b = (await v.list('u', 'budgets')).map((d) => d.data);
  const oct = b.filter((x) => x.monthIndex === 9);
  assert.equal(oct.find((x) => x.item === 'Groceries').amount, 320);
  assert.equal(oct.find((x) => x.item === 'Salary').amount, 3000);
  assert.equal(oct.find((x) => x.item === 'Internet').amount, 40, 'starting budget lines are carried into the month set');
  assert.equal(b.filter((x) => x.monthIndex === 11).length, 0, 'December had nothing imported: untouched');
  const again = await importedToBudget(v, 'u', { year: '2026', months: [9, 10, 11] }, { dryRun: true });
  assert.equal(again.totals.entriesToRemove, 0); assert.equal(again.totals.budgetLinesToWrite, 0);
});

test('an existing month budget line is updated, not duplicated', async () => {
  const v = mk();
  await v.add('u', 'budgets', { year: '2026', monthIndex: 9, type: 'expense', group: 'Variable', category: 'Food', item: 'Groceries', amount: 250 });
  await v.add('u', 'entries', e({ amount: 280 }));
  const r = await importedToBudget(v, 'u', { year: '2026', months: [9] });
  assert.equal(r.totals.budgetLinesToUpdate, 1);
  const b = (await v.list('u', 'budgets')).map((d) => d.data);
  assert.equal(b.length, 1); assert.equal(b[0].amount, 280);
});
