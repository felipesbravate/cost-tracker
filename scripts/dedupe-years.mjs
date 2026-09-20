// One-off, local: removes duplicate `years` documents (same year label), keeping the earliest.
// A `years` document holds only the label, currency and creation time. Entries are NOT touched.
//   node --env-file=.env.local scripts/dedupe-years.mjs --user you@example.com [--dry-run]
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : []).filter((x) => x.length));
if (!args.user) { console.error('usage: dedupe-years.mjs --user <email> [--dry-run]'); process.exit(2); }

const { createClient } = await import('@supabase/supabase-js');
const { loadMasterKeys } = await import('../src/lib/keyring.js');
const { supabaseStores } = await import('../src/lib/supabase-stores.js');
const { Vault } = await import('../src/lib/vault.js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stores = supabaseStores(sb);
const { data: prof, error } = await sb.from('profiles').select('user_id').eq('email', String(args.user).toLowerCase()).maybeSingle();
if (error || !prof) { console.error('No such account.'); process.exit(1); }
const vault = new Vault({ master: loadMasterKeys(process.env), keys: stores.keys, docs: stores.docs });

const years = await vault.list(prof.user_id, 'years');
const byLabel = new Map();
for (const y of years) byLabel.set(String(y.data.year), [...(byLabel.get(String(y.data.year)) || []), y]);
let removed = 0;
for (const [label, docs] of byLabel) {
  if (docs.length < 2) continue;
  docs.sort((a, b) => String(a.data.createdAt || '').localeCompare(String(b.data.createdAt || '')) || (a.id < b.id ? -1 : 1));
  console.log(`year ${label}: ${docs.length} copies, keeping the earliest`);
  for (const d of docs.slice(1)) { if (!args['dry-run']) await vault.remove(prof.user_id, 'years', d.id); removed++; }
}
console.log(args['dry-run'] ? `dry run: would remove ${removed}` : `removed ${removed} duplicate year document(s)`);
