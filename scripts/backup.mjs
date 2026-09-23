// Weekly backup of the whole database (ciphertext + wrapped keys; useless without the master key).
//   node --env-file=.env.local scripts/backup.mjs [--out DIR]... [--keep 12]
// Writes costs-tracker-YYYY-MM-DD.json.gz into every --out folder (default: private/backups), after checking
// that EVERY document in it opens with the master key. Keeps the newest --keep files per folder.
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { buildSnapshot, keyFingerprint, verifySnapshot } from '../src/lib/backup.js';
import { loadMasterKeys } from '../src/lib/keyring.js';

const args = process.argv.slice(2);
const outs = args.flatMap((a, i) => (a === '--out' ? [args[i + 1]] : []));
if (!outs.length) outs.push('private/backups');
const keep = Number(args[args.indexOf('--keep') + 1]) || 12;
for (const n of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'MASTER_KEYS', 'MASTER_KEY_ACTIVE']) if (!process.env[n]) { console.error(`Missing ${n} (run with --env-file=.env.local)`); process.exit(2); }

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function all(table, order) {
  const out = [];
  for (let from = 0; ; ) {
    const r = await sb.from(table).select('*').order(order[0]).order(order[1] || order[0]).range(from, from + 999);
    if (r.error) throw new Error(`${table}: ${r.error.message}`);
    if (!r.data.length) break;
    out.push(...r.data); from += r.data.length;
  }
  return out;
}
const users = [];
for (let page = 1; ; page++) {
  const r = await sb.auth.admin.listUsers({ page, perPage: 1000 });
  if (r.error) throw new Error('auth users: ' + r.error.message);
  users.push(...r.data.users);
  if (r.data.users.length < 1000) break;
}
const snap = buildSnapshot({
  users, profiles: await all('profiles', ['user_id']), userKeys: await all('user_keys', ['user_id']),
  documents: await all('documents', ['user_id', 'doc_id']),
  source: new URL(process.env.SUPABASE_URL).host, fingerprint: keyFingerprint(process.env.MASTER_KEYS),
});
const v = verifySnapshot(snap, loadMasterKeys(process.env));
if (!v.ok) { console.error(`Backup NOT written: ${v.failures.length} rows can't be opened with this master key`, v.failures.slice(0, 5)); process.exit(1); }

const gz = gzipSync(JSON.stringify(snap));
const name = `costs-tracker-${snap.createdAt.slice(0, 10)}.json.gz`;
let written = 0;
for (const dir of outs) {
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name + '.tmp'), gz); renameSync(join(dir, name + '.tmp'), join(dir, name));
    const old = readdirSync(dir).filter((f) => /^costs-tracker-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).sort().reverse().slice(keep);
    old.forEach((f) => unlinkSync(join(dir, f)));
    console.log(`✓ ${join(dir, name)} (${(gz.length / 1024).toFixed(0)} KB)${old.length ? `, removed ${old.length} old` : ''}`);
    written++;
  } catch (e) { console.error(`✗ could not write to ${dir}: ${e.message}`); }
}
console.log(`${snap.counts.users} users, ${snap.counts.documents} documents (${JSON.stringify(snap.counts.byCollection)}), all verified. Key ${snap.masterKeyFingerprint}.`);
process.exit(written === outs.length ? 0 : 1);
