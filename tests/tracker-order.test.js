import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel, yearsFromDocs } from '../src/tracker/model.js';

const taxonomy = { incomes: ['Salary', 'Freela'], investments: [], expenses: { Variable: { Food: ['Supermarket', 'Restaurants'], Fun: ['Cinema', 'Games'] } } };
const m = createModel({
  data: yearsFromDocs([{ id: 'y', year: '2026', currency: 'EUR', createdAt: '2026-01-01', taxonomy }]),
  entries: [
    { id: '1', year: '2026', monthIndex: 3, type: 'expense', group: 'Variable', category: 'Fun', item: 'Games', amount: 500, description: 'x', date: '2026-04-02' },
    { id: '2', year: '2026', monthIndex: 3, type: 'expense', group: 'Variable', category: 'Food', item: 'Restaurants', amount: 90, description: 'x', date: '2026-04-02' },
    { id: '3', year: '2026', monthIndex: 3, type: 'income', group: null, category: null, item: 'Freela', amount: 900, description: 'x', date: '2026-04-02' },
  ],
  overrides: [], budgets: [], budgetDefaults: [],
});

test('Tracker keeps the order the user set, whatever the amounts', () => {
  const y = m.DATA[0];
  const v = m.buildBreakdown(y, 3, 'Variable');
  assert.deepEqual(v.rows.map((c) => c.category), ['Food', 'Fun']);
  assert.deepEqual(v.rows[0].items.map((r) => r.item), ['Supermarket', 'Restaurants']);
  assert.deepEqual(v.rows[1].items.map((r) => r.item), ['Cinema', 'Games']);
  assert.deepEqual(m.buildBreakdown(y, 3, 'Income').rows.map((r) => r.item), ['Salary', 'Freela']);
});
