import test from 'node:test';
import assert from 'node:assert/strict';
import { convertSheet, parseSheetFile } from '../src/lib/import-sheet.js';

const fake = { years: [{ year: '2025', currency: 'EUR',
  incomes: [{ item: 'Salary', values: [1000, 1000, 0, ...Array(9).fill(0)], notes: 'x' }],
  investments: [{ item: 'Savings', values: [50, ...Array(11).fill(0)] }],
  expenses: { Fixed: [{ item: 'Rent', category: 'Habitation', values: [400, 400, -20, ...Array(9).fill(0)] }], Variable: [], Extra: [], Additional: [] } }] };

test('converts non-zero cells into entries and years', () => {
  const r = convertSheet(fake, { now: 'N' });
  assert.deepEqual(r.report, { years: 1, entries: 6, negatives: 1, notesDropped: 1 });
  assert.deepEqual(r.years, [{ year: '2025', currency: 'EUR', createdAt: 'N' }]);
  const rent = r.entries.filter((e) => e.item === 'Rent');
  assert.equal(rent.length, 3);
  assert.equal(rent[0].group, 'Fixed'); assert.equal(rent[0].category, 'Habitation'); assert.equal(rent[0].date, '2025-01-01');
  const salary = r.entries.find((e) => e.item === 'Salary');
  assert.equal(salary.group, null); assert.equal(salary.category, null); assert.equal(salary.type, 'income');
});
test('parses the export file format', () => {
  const d = parseSheetFile('window.MONTHLY_COSTS_DATA = ' + JSON.stringify(fake) + ';');
  assert.equal(d.years.length, 1);
  assert.throws(() => parseSheetFile('window.x = 1'), /does not define/);
});
