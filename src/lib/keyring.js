// @ts-check
// Key hierarchy (envelope encryption):
//
//   MASTER KEY (KEK)  -- lives only in the server environment, never in the database or Git
//        |  wraps
//   USER KEY (DEK)    -- random per user, stored WRAPPED in the database
//        |  encrypts
//   USER DATA         -- every document payload (amounts, descriptions, notes...)
//
// Consequences: a database dump or backup leaks only ciphertext. Deleting a user's wrapped key
// makes their data permanently unreadable (crypto-shredding). Rotating the master key only
// re-wraps the small per-user keys, not the data.
import { decryptBytes, encryptBytes, newKey } from './crypto.js';

/**
 * @typedef {{ active: string, keys: Record<string, Buffer> }} MasterKeys
 */

/**
 * Reads MASTER_KEYS (JSON: {"v1":"<base64 of 32 bytes>", ...}) and MASTER_KEY_ACTIVE (e.g. "v1").
 * Old versions stay in MASTER_KEYS so existing wrapped keys can still be opened during a rotation.
 * @param {Record<string, string | undefined>} env
 * @returns {MasterKeys}
 */
export function loadMasterKeys(env) {
  const raw = env.MASTER_KEYS;
  const active = env.MASTER_KEY_ACTIVE;
  if (!raw || !active) throw new Error('MASTER_KEYS and MASTER_KEY_ACTIVE must be set (run: npm run gen-key)');
  /** @type {Record<string, string>} */
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('MASTER_KEYS is not valid JSON'); }
  /** @type {Record<string, Buffer>} */
  const keys = {};
  for (const [version, b64] of Object.entries(parsed)) {
    const buf = Buffer.from(String(b64), 'base64');
    if (buf.length !== 32) throw new Error(`master key ${version} must decode to exactly 32 bytes`);
    keys[version] = buf;
  }
  if (!keys[active]) throw new Error(`MASTER_KEY_ACTIVE "${active}" is not present in MASTER_KEYS`);
  return { active, keys };
}

const dekAad = (/** @type {string} */ userId) => `dek|${userId}`;

/**
 * @param {MasterKeys} master
 * @param {string} userId
 * @param {Buffer} dek
 * @returns {{ kekVersion: string, wrapped: string }}
 */
export function wrapDek(master, userId, dek) {
  const kek = master.keys[master.active];
  return { kekVersion: master.active, wrapped: encryptBytes(kek, dek, dekAad(userId)).toString('base64') };
}

/**
 * @param {MasterKeys} master
 * @param {string} userId
 * @param {string} kekVersion
 * @param {string} wrapped base64
 * @returns {Buffer}
 */
export function unwrapDek(master, userId, kekVersion, wrapped) {
  const kek = master.keys[kekVersion];
  if (!kek) throw new Error(`master key version "${kekVersion}" is not available`);
  return decryptBytes(kek, Buffer.from(wrapped, 'base64'), dekAad(userId));
}

/** @returns {Buffer} */
export function newDek() {
  return newKey();
}

/**
 * Tiny in-memory cache so a request burst does not unwrap the same key repeatedly.
 * Short TTL: keys are not kept in memory longer than needed.
 */
export class DekCache {
  /** @param {number} [ttlMs] */
  constructor(ttlMs = 60_000) {
    this.ttlMs = ttlMs;
    /** @type {Map<string, { dek: Buffer, at: number }>} */
    this.map = new Map();
  }
  /** @param {string} userId */
  get(userId) {
    const hit = this.map.get(userId);
    if (!hit) return null;
    if (Date.now() - hit.at > this.ttlMs) { hit.dek.fill(0); this.map.delete(userId); return null; }
    return hit.dek;
  }
  /** @param {string} userId @param {Buffer} dek */
  set(userId, dek) {
    this.map.set(userId, { dek, at: Date.now() });
  }
  /** @param {string} userId */
  delete(userId) {
    const hit = this.map.get(userId);
    if (hit) hit.dek.fill(0);
    this.map.delete(userId);
  }
}
