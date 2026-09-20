// One-off, local import of YOUR OWN spreadsheet export into your account, encrypted like any other data.
//   node --env-file=.env.local scripts/import-data.mjs --user you@example.com --file ./private/monthly_costs_data.js [--dry-run]
// The data file must stay outside Git (see .gitignore: /private). Nothing here prints amounts or item names.
import { readFileSync } from 'node:fs';
import { convertSheet, parseSheetFile } from '../src/lib/import-sheet.js';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : []).filter((x) => x.length));
if (!args.user || !args.file) { console.error('usage: import-data.mjs --user <email> --file <path> [--dry-run]'); process.exit(2); }

const { years, entries, report } = convertSheet(parseSheetFile(readFileSync(String(args.file), 'utf8')));
console.log('parsed:', report);
if (args['dry-run']) { console.log('dry run: nothing written'); process.exit(0); }

const { createClient } = await import('@supabase/supabase-js'); // loaded late so --dry-run needs no install
const { loadMasterKeys } = await import('../src/lib/keyring.js');
const { supabaseStores } = await import('../src/lib/supabase-stores.js');
const { Vault } = await import('../src/lib/vault.js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stores = supabaseStores(sb);
const { data: prof, error } = await sb.from('profiles').select('user_id,status').eq('email', String(args.user).toLowerCase()).maybeSingle();
if (error || !prof) { console.error('No such account. Sign in once with that email first, then re-run.'); process.exit(1); }
const existing = await stores.docs.list(prof.user_id, 'entries');
if (existing.length && !args.force) { console.error(`Account already has ${existing.length} entries. Re-run with --force to add anyway (this can duplicate).`); process.exit(1); }
const vault = new Vault({ master: loadMasterKeys(process.env), keys: stores.keys, docs: stores.docs });
const haveYears = new Set((await vault.list(prof.user_id, 'years')).map((d) => String(d.data.year)));
for (const y of years) if (!haveYears.has(y.year)) await vault.add(prof.user_id, 'years', y);
let n = 0;
for (const e of entries) { await vault.add(prof.user_id, 'entries', e); if (++n % 200 === 0) console.log(`  ${n}/${entries.length}`); }
console.log(`imported ${years.length} years and ${entries.length} entries (encrypted).`);
