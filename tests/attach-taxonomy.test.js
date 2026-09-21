import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Vault, memoryStores } from '../src/lib/vault.js';
import { attachTaxonomy } from '../src/lib/attach-taxonomy.js';
import { taxonomyOfYear } from '../src/lib/import-sheet.js';

const mk = () => { const s = memoryStores(); return new Vault({ master: { active: 'v1', keys: { v1: randomBytes(32) } }, keys: s.keys, docs: s.docs }); };
const zero = Array(12).fill(0);
const sheet = { years: [
  { year: '2025', incomes: [{ item: 'Salary', values: zero }], investments: [{ item: 'Trips', values: zero }],
    expenses: { Fixed: [{ item: 'Rent', category: 'Habitation', values: zero }, { item: 'Rent', category: 'Habitation', values: zero }], Variable: [{ item: 'Lunch', category: 'Food', values: zero }], Extra: [], Additional: [] } },
  { year: '2026', incomes: [{ item: 'Salary', values: zero }, { item: 'Freela', values: zero }], investments: [],
    expenses: { Fixed: [{ item: 'Rent', category: 'Habitation', values: zero }], Variable: [], Extra: [], Additional: [] } },
] };

test('taxonomyOfYear keeps rows that are 0 all year, drops duplicates and empty groups', () => {
  assert.deepEqual(taxonomyOfYear(sheet.years[0]), { incomes: ['Salary'], investments: ['Trips'], expenses: { Fixed: { Habitation: ['Rent'] }, Variable: { Food: ['Lunch'] } } });
});
test('attaches each year its own taxonomy, never touches entries, is idempotent', async () => {
  const v = mk();
  await v.add('u', 'years', { year: '2025', currency: 'EUR', createdAt: 'x' });
  await v.add('u', 'years', { year: '2026', currency: 'EUR', createdAt: 'x' });
  await v.add('u', 'years', { year: '2030', currency: 'EUR', createdAt: 'x' });
  await v.add('u', 'entries', { year: '2025', type: 'income', item: 'Salary', amount: 5 });
  const dry = await attachTaxonomy(v, 'u', sheet, { dryRun: true });
  assert.deepEqual(dry, { years: 3, attached: 2, already: 0, notInSheet: 1, written: 0 });
  assert.ok((await v.list('u', 'years')).every((d) => !d.data.taxonomy), 'dry run writes nothing');
  const r = await attachTaxonomy(v, 'u', sheet);
  assert.equal(r.written, 2);
  const ys = (await v.list('u', 'years')).map((d) => d.data);
  assert.deepEqual(ys.find((y) => y.year === '2026').taxonomy.incomes, ['Salary', 'Freela']);
  assert.deepEqual(ys.find((y) => y.year === '2025').taxonomy.expenses.Variable, { Food: ['Lunch'] });
  assert.equal(ys.find((y) => y.year === '2030').taxonomy, undefined);
  assert.equal(ys.find((y) => y.year === '2026').createdAt, 'x', 'other fields untouched');
  assert.equal((await v.list('u', 'entries')).length, 1);
  assert.equal((await attachTaxonomy(v, 'u', sheet)).attached, 0, 're-run changes nothing');
});
