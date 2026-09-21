// One-off, local: gives every year you ALREADY imported the list of categories that year had in your spreadsheet,
// so the app offers (and the receipt reader picks from) only what exists in that specific year.
//   node --env-file=.env.local scripts/attach-taxonomy.mjs --user you@example.com --file ./private/monthly_costs_data.js [--dry-run]
// Only the `taxonomy` field of each year is written. Entries are never touched. Safe to re-run. Prints counts only.
import { readFileSync } from 'node:fs';
import { parseSheetFile } from '../src/lib/import-sheet.js';
import { attachTaxonomy } from '../src/lib/attach-taxonomy.js';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : []).filter((x) => x.length));
if (!args.user || !args.file) { console.error('usage: attach-taxonomy.mjs --user <email> --file <path> [--dry-run]'); process.exit(2); }

const sheet = parseSheetFile(readFileSync(String(args.file), 'utf8'));
const { createClient } = await import('@supabase/supabase-js');
const { loadMasterKeys } = await import('../src/lib/keyring.js');
const { supabaseStores } = await import('../src/lib/supabase-stores.js');
const { Vault } = await import('../src/lib/vault.js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stores = supabaseStores(sb);
const { data: prof, error } = await sb.from('profiles').select('user_id').eq('email', String(args.user).toLowerCase()).maybeSingle();
if (error || !prof) { console.error('No such account.'); process.exit(1); }
const vault = new Vault({ master: loadMasterKeys(process.env), keys: stores.keys, docs: stores.docs });
console.log(await attachTaxonomy(vault, prof.user_id, sheet, { dryRun: !!args['dry-run'] }));
if (args['dry-run']) console.log('dry run: nothing written');
