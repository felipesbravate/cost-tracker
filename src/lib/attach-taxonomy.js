// @ts-check
// Stores, on every imported year, the categories that year really had in the spreadsheet (see taxonomyOfYear).
// Only the `taxonomy` field of a `years` document is ever written; entries are never touched. Safe to re-run.
import { taxonomyOfYear } from './import-sheet.js';

/**
 * @param {import('./vault.js').Vault} vault
 * @param {string} userId
 * @param {{ years: any[] }} sheet  parsed export
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function attachTaxonomy(vault, userId, sheet, opts = {}) {
  const wanted = new Map((sheet.years || []).map((/** @type {any} */ y) => [String(y.year), taxonomyOfYear(y)]));
  const docs = await vault.list(userId, 'years');
  let attached = 0, already = 0, notInSheet = 0;
  for (const d of docs) {
    const t = wanted.get(String(d.data.year));
    if (!t) { notInSheet++; continue; }
    if (JSON.stringify(d.data.taxonomy) === JSON.stringify(t)) { already++; continue; }
    if (!opts.dryRun) await vault.set(userId, 'years', d.id, { ...d.data, taxonomy: t });
    attached++;
  }
  return { years: docs.length, attached, already, notInSheet, written: opts.dryRun ? 0 : attached };
}
