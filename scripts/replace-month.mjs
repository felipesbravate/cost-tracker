// One-off, local: refreshes one month of IMPORTED entries from a newer export of your sheet.
//   node --env-file=.env.local scripts/replace-month.mjs --user you@example.com --file ./private/patch-2026-09.json [--dry-run]
// Only entries the importer created ("Imported") for that year and month are replaced. Entries you added in the
// app, and every other month, are untouched. Prints counts only, never names, notes or amounts.
import { readFileSync } from 'node:fs';
import { replaceMonth } from '../src/lib/replace-month.js';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : []).filter((x) => x.length));
if (!args.user || !args.file) { console.error('usage: replace-month.mjs --user <email> --file <patch.json> [--dry-run]'); process.exit(2); }
const patch = JSON.parse(readFileSync(String(args.file), 'utf8'));

const { createClient } = await import('@supabase/supabase-js');
const { loadMasterKeys } = await import('../src/lib/keyring.js');
const { supabaseStores } = await import('../src/lib/supabase-stores.js');
const { Vault } = await import('../src/lib/vault.js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stores = supabaseStores(sb);
const { data: prof, error } = await sb.from('profiles').select('user_id').eq('email', String(args.user).toLowerCase()).maybeSingle();
if (error || !prof) { console.error('No such account.'); process.exit(1); }
const vault = new Vault({ master: loadMasterKeys(process.env), keys: stores.keys, docs: stores.docs });
console.log(`${patch.year}-${String(patch.monthIndex + 1).padStart(2, '0')}:`, await replaceMonth(vault, prof.user_id, patch, { dryRun: !!args['dry-run'] }));
