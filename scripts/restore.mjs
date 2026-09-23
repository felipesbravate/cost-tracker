// Restores one user's data from a backup file into the project in .env.local (can be a NEW project).
//   node --env-file=.env.local scripts/restore.mjs --file backup.json.gz --user you@example.com [--dry-run] [--force]
// The user must have signed in once on the target site (so the account and profile exist).
// Refuses if that user already has entries, unless --force (documents with the same ids are overwritten).
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { restoreUser, verifySnapshot } from '../src/lib/backup.js';
import { loadMasterKeys } from '../src/lib/keyring.js';
import { supabaseStores } from '../src/lib/supabase-stores.js';
import { Vault } from '../src/lib/vault.js';

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const file = arg('--file'), email = String(arg('--user') || '').toLowerCase();
if (!file || !email) { console.error('usage: restore.mjs --file <backup.json.gz> --user <email> [--dry-run] [--force]'); process.exit(2); }
const raw = readFileSync(file);
const snap = JSON.parse((raw[0] === 0x1f ? gunzipSync(raw) : raw).toString('utf8'));
const master = loadMasterKeys(process.env);
const v = verifySnapshot(snap, master);
console.log(`backup of ${snap.source} from ${snap.createdAt}: ${v.documents} documents open with this key${v.ok ? '' : `, ${v.failures.length} do NOT`}`);
const from = snap.users.find((u) => String(u.email).toLowerCase() === email);
if (!from) { console.error(`${email} is not in this backup`); process.exit(1); }

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const prof = await sb.from('profiles').select('user_id,status').eq('email', email).maybeSingle();
if (prof.error || !prof.data) { console.error(`${email} has no account on ${new URL(process.env.SUPABASE_URL).host} yet: sign in once on the site first.`); process.exit(1); }
const stores = supabaseStores(sb);
const vault = new Vault({ master, keys: stores.keys, docs: stores.docs });
const existing = await vault.list(prof.data.user_id, 'entries');
if (existing.length && !args.includes('--force')) { console.error(`${email} already has ${existing.length} entries here. Add --force to overwrite/merge.`); process.exit(1); }
const r = await restoreUser(snap, master, vault, { fromUserId: from.id, toUserId: prof.data.user_id, dryRun: args.includes('--dry-run') });
console.log(args.includes('--dry-run') ? 'dry run, nothing written:' : `restored ${r.restored} documents:`, r.counts);
