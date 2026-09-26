// @ts-check
// Turns the spreadsheet's figures for chosen months into that month's budget (Felipe, Sept 26: Oct–Dec 2026 in his
// sheet are plans, not spending). For each month:
//   - every "Imported" entry (created by the importer) becomes a month-budget line: { year, monthIndex, type, group,
//     category, item, amount } (entries of the same item are added together);
//   - the month's budget set starts from what already applies to it (its own month budget, else the year's starting
//     budget), so nothing that was budgeted disappears; an imported item sets or replaces its line;
//   - budgets are written first, then the imported entries are removed. An interruption can only leave both
//     (re-running converges), never neither. Entries added in the app are never touched.

/**
 * @param {import('./vault.js').Vault} vault
 * @param {string} userId
 * @param {{ year: string, months: number[] }} target  months are 0-based (Oct = 9)
 * @param {{ dryRun?: boolean, now?: string }} [opts]
 */
export async function importedToBudget(vault, userId, target, opts = {}) {
  const year = String(target.year);
  if (!/^\d{4}$/.test(year) || !Array.isArray(target.months) || !target.months.every((m) => Number.isInteger(m) && m >= 0 && m <= 11)) {
    throw new Error('target must be { year: "YYYY", months: [0-11, ...] }');
  }
  const now = opts.now || new Date().toISOString();
  const key = (/** @type {any} */ x) => [x.type, x.group ?? '', x.category ?? '', x.item].join('␟');
  const entries = await vault.list(userId, 'entries');
  const budgets = await vault.list(userId, 'budgets');
  const starting = budgets.filter((b) => String(b.data.year) === year && (b.data.monthIndex === undefined || b.data.monthIndex === null));
  const perMonth = [];
  const toWrite = [], toUpdate = [], toRemove = [];
  for (const mi of target.months) {
    const imported = entries.filter((d) => String(d.data.year) === year && d.data.monthIndex === mi && d.data.description === 'Imported');
    const sums = new Map();
    for (const d of imported) {
      const k = key(d.data), cur = sums.get(k);
      sums.set(k, { ...(cur || { type: d.data.type, group: d.data.group ?? null, category: d.data.category ?? null, item: d.data.item, amount: 0 }), amount: Math.round(((cur ? cur.amount : 0) + (d.data.amount || 0)) * 100) / 100 });
    }
    const own = budgets.filter((b) => String(b.data.year) === year && b.data.monthIndex === mi);
    const ownByKey = new Map(own.map((b) => [key(b.data), b]));
    let created = 0, changed = 0, copied = 0;
    // A month without its own budget set: copy the year's starting lines first (a month set replaces the starting one).
    if (!own.length && sums.size) {
      for (const b of starting) {
        if (sums.has(key(b.data))) continue;
        const { id, ...rest } = /** @type {any} */ ({ ...b.data });
        toWrite.push({ ...rest, year, monthIndex: mi, createdAt: now, source: 'budget-copy' }); copied++;
      }
    }
    for (const [k, s] of sums) {
      const ex = ownByKey.get(k);
      if (ex) {
        if (Math.abs((ex.data.amount || 0) - s.amount) > 0.005) { toUpdate.push({ id: ex.id, data: { ...ex.data, amount: s.amount, updatedAt: now } }); changed++; }
      } else { toWrite.push({ year, monthIndex: mi, ...s, createdAt: now, source: 'from-imported' }); created++; }
    }
    imported.forEach((d) => toRemove.push(d.id));
    perMonth.push({ month: mi + 1, importedEntries: imported.length, budgetLines: sums.size, newLines: created, updatedLines: changed, copiedFromStartingBudget: copied });
  }
  const summary = { year, months: perMonth, totals: { entriesToRemove: toRemove.length, budgetLinesToWrite: toWrite.length, budgetLinesToUpdate: toUpdate.length } };
  if (opts.dryRun) return { ...summary, dryRun: true };
  for (const b of toWrite) await vault.add(userId, 'budgets', b);
  for (const u of toUpdate) await vault.set(userId, 'budgets', u.id, u.data);
  for (const id of toRemove) await vault.remove(userId, 'entries', id);
  return { ...summary, done: true };
}
