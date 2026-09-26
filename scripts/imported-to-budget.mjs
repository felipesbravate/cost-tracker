// One-off, local: turns the IMPORTED spreadsheet figures of some months into those months' budget.
//   node --env-file=.env.local scripts/imported-to-budget.mjs --user you@example.com --year 2026 --months 10,11,12 [--apply]
// Without --apply it only reports what it would do (counts only, never names or amounts). Run a backup first:
//   node --env-file=.env.local scripts/backup.mjs
import { importedToBudget } from '../src/lib/imported-to-budget.js';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : []).filter((x) => x.length));
if (!args.user || !args.year || !args.months) { console.error('usage: imported-to-budget.mjs --user <email> --year YYYY --months 10,11,12 [--apply]'); process.exit(2); }
const months = String(args.months).split(',').map((m) => Number(m.trim()) - 1);

const { createClient } = await import('@supabase/supabase-js');
const { loadMasterKeys } = await import('../src/lib/keyring.js');
const { supabaseStores } = await import('../src/lib/supabase-stores.js');
const { Vault } = await import('../src/lib/vault.js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stores = supabaseStores(sb);
const { data: prof, error } = await sb.from('profiles').select('user_id').eq('email', String(args.user).toLowerCase()).maybeSingle();
if (error) { console.error('Could not reach the database:', error.message || error); process.exit(1); }
if (!prof) { console.error('No such account.'); process.exit(1); }
const vault = new Vault({ master: loadMasterKeys(process.env), keys: stores.keys, docs: stores.docs });
const r = await importedToBudget(vault, prof.user_id, { year: String(args.year), months }, { dryRun: !args.apply });
console.log(JSON.stringify(r, null, 2));
if (!args.apply) console.log('\nDry run: nothing changed. Add --apply to do it.');
