import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel, yearsFromDocs } from '../src/tracker/model.js';

const model = (budgets, entries) => createModel({ data: yearsFromDocs([{ id: 'y', year: '2026', currency: 'EUR', createdAt: '2026-01-01' }]), entries, overrides: [], budgets, budgetDefaults: [] });
const b = (o) => ({ year: '2026', type: 'expense', group: 'Variable', category: 'Fun', item: 'Restaurants', amount: 400, ...o });
const e = (o) => ({ id: Math.random().toString(36), year: '2026', monthIndex: 9, type: 'expense', group: 'Variable', category: 'Fun', item: 'Restaurants', description: 'Dinner', amount: 250, date: '2026-10-03', createdAt: '2026-09-26T10:00:00Z', ...o });
const SEP = new Date('2026-09-26T12:00:00');

test('over budget in a budgeted later month of this year alerts (entries dated ahead)', () => {
  const m = model([b({ monthIndex: 9 })], [e(), e({ amount: 200, createdAt: '2026-09-26T11:00:00Z' })]);
  const a = m.budgetAlerts(SEP);
  assert.equal(a.length, 1);
  assert.deepEqual([a[0].item, a[0].mi, a[0].spent, a[0].budget, a[0].at], ['Restaurants', 9, 450, 400, '2026-09-26T11:00:00Z']);
});

test('no alert: under budget, a Fixed item, or no budget for that month', () => {
  assert.equal(model([b({ monthIndex: 9 })], [e()]).budgetAlerts(SEP).length, 0);
  assert.equal(model([b({ monthIndex: 9, group: 'Fixed' })], [e({ group: 'Fixed', amount: 900 })]).budgetAlerts(SEP).length, 0);
  assert.equal(model([b({ monthIndex: 9 })], [e({ monthIndex: 8, amount: 900, date: '2026-09-10' })]).budgetAlerts(SEP).length, 0);
});
