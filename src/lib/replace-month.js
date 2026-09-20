// @ts-check
// Refreshes ONE month of imported spreadsheet entries from a newer export of the same sheet.
// Only entries whose description is "Imported" (i.e. created by the importer) for that exact year+month are
// replaced; anything the user added in the app (any other description) is never touched, nor are other months.
// New entries are written first and the old ones removed afterwards, so an interruption can only leave
// duplicates (re-running fixes that), never a gap.

/**
 * @param {import('./vault.js').Vault} vault
 * @param {string} userId
 * @param {{ year: string, monthIndex: number, entries: any[] }} patch
 * @param {{ dryRun?: boolean, now?: string }} [opts]
 */
export async function replaceMonth(vault, userId, patch, opts = {}) {
  if (!patch || !/^\d{4}$/.test(String(patch.year)) || !Number.isInteger(patch.monthIndex) || patch.monthIndex < 0 || patch.monthIndex > 11 || !Array.isArray(patch.entries)) {
    throw new Error('patch must be { year, monthIndex 0-11, entries[] }');
  }
  for (const e of patch.entries) {
    if (String(e.year) !== String(patch.year) || e.monthIndex !== patch.monthIndex || e.description !== 'Imported' || typeof e.amount !== 'number') {
      throw new Error('every patch entry must be an "Imported" entry for the patch year and month');
    }
  }
  const now = opts.now || new Date().toISOString();
  const key = (/** @type {any} */ e) => [e.type, e.group ?? '', e.category ?? '', e.item].join('␟');
  const oldDocs = (await vault.list(userId, 'entries')).filter((d) =>
    String(d.data.year) === String(patch.year) && d.data.monthIndex === patch.monthIndex && d.data.description === 'Imported');
  const oldByKey = new Map(oldDocs.map((d) => [key(d.data), d.data]));
  const newKeys = new Set(patch.entries.map(key));
  const changed = patch.entries.filter((e) => {
    const o = oldByKey.get(key(e));
    return !o || Math.abs((o.amount || 0) - e.amount) > 0.005 || (o.note || '') !== (e.note || '');
  }).length;
  const removedItems = oldDocs.filter((d) => !newKeys.has(key(d.data))).length;
  const summary = { existing: oldDocs.length, incoming: patch.entries.length, changedOrNew: changed, noLongerInSheet: removedItems };
  if (opts.dryRun) return { ...summary, written: 0, removed: 0 };
  for (const e of patch.entries) await vault.add(userId, 'entries', { ...e, createdAt: now });
  for (const d of oldDocs) await vault.remove(userId, 'entries', d.id);
  return { ...summary, written: patch.entries.length, removed: oldDocs.length };
}
