// One-off, local: attaches the per-month item notes from your spreadsheet export to entries you ALREADY imported.
//   node --env-file=.env.local scripts/attach-notes.mjs --user you@example.com --file ./private/monthly_costs_data.js [--dry-run]
// Matches each note to the imported entry with the same year/month/type/group/category/item/amount and only ever
// adds the `note` (and `realAmounts`) fields. Safe to re-run. Nothing here prints notes, item names or amounts.
import { readFileSync } from 'node:fs';
import { convertSheet, parseSheetFile } from '../src/lib/import-sheet.js';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : []).filter((x) => x.length));
if (!args.user || !args.file) { console.error('usage: attach-notes.mjs --user <email> --file <path> [--dry-run]'); process.exit(2); }

const { entries, report } = convertSheet(parseSheetFile(readFileSync(String(args.file), 'utf8')));
const wanted = entries.filter((e) => e.note);
console.log('file:', { notesToAttach: wanted.length, notesOnZeroMonths: report.notesWithoutEntry });
if (args['dry-run']) { console.log('dry run: nothing written'); process.exit(0); }

const key = (e) => [e.year, e.monthIndex, e.type, e.group ?? '', e.category ?? '', e.item].join('␟');
const { createClient } = await import('@supabase/supabase-js');
const { loadMasterKeys } = await import('../src/lib/keyring.js');
const { supabaseStores } = await import('../src/lib/supabase-stores.js');
const { Vault } = await import('../src/lib/vault.js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stores = supabaseStores(sb);
const { data: prof, error } = await sb.from('profiles').select('user_id').eq('email', String(args.user).toLowerCase()).maybeSingle();
if (error || !prof) { console.error('No such account.'); process.exit(1); }
const vault = new Vault({ master: loadMasterKeys(process.env), keys: stores.keys, docs: stores.docs });

const existing = (await vault.list(prof.user_id, 'entries')).filter((d) => d.data.description === 'Imported');
const byKey = new Map();
for (const d of existing) byKey.set(key(d.data), [...(byKey.get(key(d.data)) || []), d]);
const wantedByKey = new Map();
for (const e of wanted) wantedByKey.set(key(e), [...(wantedByKey.get(key(e)) || []), e]);

let attached = 0, already = 0, missing = 0, ambiguous = 0, mismatch = 0;
for (const [k, list] of wantedByKey) {
  const docs = byKey.get(k) || [];
  if (!docs.length) { missing += list.length; continue; }
  if (docs.length > 1 || list.length > 1) { ambiguous += list.length; continue; } // duplicate item rows: never guess
  const [d] = docs, [e] = list;
  if (Math.abs((d.data.amount || 0) - e.amount) > 0.005) { mismatch++; continue; }
  if (d.data.note) { already++; continue; }
  await vault.set(prof.user_id, 'entries', d.id, { ...d.data, note: e.note, ...(e.realAmounts ? { realAmounts: e.realAmounts } : {}) });
  if (++attached % 200 === 0) console.log(`  ${attached}/${wanted.length}`);
}
console.log({ attached, already, missing, ambiguous, mismatch });
