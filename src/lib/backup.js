// @ts-check
// Backup and restore of the whole database, kept provider-independent.
// A snapshot holds exactly what is in Supabase: ciphertext documents, wrapped user keys, profiles and the
// auth user list (id + email). It is useless without the master key (1Password / .env.local).
// Restore can target a NEW Supabase project: user ids change there, and because every ciphertext is bound
// to (user id, collection, doc id), documents are decrypted with the old id and re-encrypted for the new one.
import { createHash } from 'node:crypto';
import { decryptJson } from './crypto.js';
import { unwrapDek } from './keyring.js';
import { COLLECTIONS, docAad } from './vault.js';

export const FORMAT = 'costs-tracker-backup/1';

/** Short fingerprint of the MASTER_KEYS value, to tell which key a backup needs. @param {string} raw */
export const keyFingerprint = (raw) => createHash('sha256').update(String(raw || '')).digest('hex').slice(0, 12);

/**
 * @param {{ users:any[], profiles:any[], userKeys:any[], documents:any[], source:string, fingerprint:string, now?:string }} p
 */
export function buildSnapshot(p) {
  const counts = { users: p.users.length, profiles: p.profiles.length, userKeys: p.userKeys.length, documents: p.documents.length, byCollection: /** @type {Record<string,number>} */ ({}) };
  for (const d of p.documents) counts.byCollection[d.collection] = (counts.byCollection[d.collection] || 0) + 1;
  return {
    format: FORMAT, createdAt: p.now || new Date().toISOString(), source: p.source, masterKeyFingerprint: p.fingerprint, counts,
    users: p.users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at })),
    profiles: p.profiles, userKeys: p.userKeys, documents: p.documents,
  };
}

/** Opens every document with the master key: proves the backup can really be restored. */
export function verifySnapshot(snap, master) {
  if (!snap || snap.format !== FORMAT) throw new Error('Not a costs-tracker backup (unknown format)');
  const keyOf = new Map(snap.userKeys.map((k) => [k.user_id, k]));
  const deks = new Map(); const failures = [];
  for (const [uid, k] of keyOf) {
    try { deks.set(uid, unwrapDek(master, uid, k.kek_version, k.wrapped)); }
    catch (e) { failures.push({ user: uid, what: 'user key', error: String(e && e.message) }); }
  }
  let ok = 0;
  for (const d of snap.documents) {
    const dek = deks.get(d.user_id);
    if (!dek) { failures.push({ user: d.user_id, what: `${d.collection}/${d.doc_id}`, error: 'no user key' }); continue; }
    try { decryptJson(dek, d.payload, docAad(d.user_id, d.collection, d.doc_id)); ok++; }
    catch (e) { failures.push({ user: d.user_id, what: `${d.collection}/${d.doc_id}`, error: 'decrypt failed' }); }
  }
  return { ok: failures.length === 0, documents: ok, failures };
}

/**
 * Restores one user's documents from a snapshot into a vault, possibly under a different user id.
 * Document ids are kept, so running it twice overwrites instead of duplicating.
 * @param {any} snap @param {any} master @param {import('./vault.js').Vault} vault
 * @param {{ fromUserId:string, toUserId:string, dryRun?:boolean }} o
 */
export async function restoreUser(snap, master, vault, o) {
  const k = snap.userKeys.find((x) => x.user_id === o.fromUserId);
  if (!k) throw new Error('This backup has no key for that user');
  const dek = unwrapDek(master, o.fromUserId, k.kek_version, k.wrapped);
  const docs = snap.documents.filter((d) => d.user_id === o.fromUserId && COLLECTIONS.includes(d.collection));
  const plain = docs.map((d) => ({ collection: d.collection, id: d.doc_id, data: decryptJson(dek, d.payload, docAad(o.fromUserId, d.collection, d.doc_id)) }));
  const counts = {}; for (const p of plain) counts[p.collection] = (counts[p.collection] || 0) + 1;
  if (!o.dryRun) for (const p of plain) await vault.set(o.toUserId, p.collection, p.id, p.data);
  return { restored: o.dryRun ? 0 : plain.length, counts };
}
