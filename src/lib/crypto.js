// @ts-check
// AES-256-GCM helpers built only on node:crypto (no dependencies).
//
// Wire format of every ciphertext (then base64-encoded for storage):
//   [1 byte format version = 1][12 byte random IV][16 byte GCM tag][ciphertext]
// The version byte lets us change algorithms later without guessing.
// `aad` (additional authenticated data) is bound to the ciphertext: decryption
// fails if the blob is moved to a different user, collection or document id.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;

/** @param {Buffer} key */
function assertKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('crypto: key must be a 32-byte Buffer');
}

/**
 * @param {Buffer} key 32 bytes
 * @param {Buffer} plaintext
 * @param {string} aad
 * @returns {Buffer}
 */
export function encryptBytes(key, plaintext, aad) {
  assertKey(key);
  const iv = randomBytes(IV_LEN); // random 96-bit IV; per-key volume here is far below the birthday bound
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), ct]);
}

/**
 * @param {Buffer} key 32 bytes
 * @param {Buffer} blob
 * @param {string} aad
 * @returns {Buffer}
 */
export function decryptBytes(key, blob, aad) {
  assertKey(key);
  if (!Buffer.isBuffer(blob) || blob.length < 1 + IV_LEN + TAG_LEN) throw new Error('crypto: ciphertext too short');
  if (blob[0] !== VERSION) throw new Error('crypto: unsupported ciphertext version');
  const iv = blob.subarray(1, 1 + IV_LEN);
  const tag = blob.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const ct = blob.subarray(1 + IV_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch (err) {
    console.log("[DECRYPT ERROR]", { errMessage: err.message, keyHex: key.toString("hex").substring(0, 16), aadLength: aad.length, ctLength: ct.length, tagHex: tag.toString("hex") });
    throw new Error("crypto: decryption failed");
  }
}

/** @param {Buffer} key @param {unknown} value @param {string} aad @returns {string} base64 */
export function encryptJson(key, value, aad) {
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error('crypto: value is not JSON-serialisable');
  return encryptBytes(key, Buffer.from(json, 'utf8'), aad).toString('base64');
}

/** @param {Buffer} key @param {string} b64 @param {string} aad @returns {any} */
export function decryptJson(key, b64, aad) {
  return JSON.parse(decryptBytes(key, Buffer.from(b64, 'base64'), aad).toString('utf8'));
}

/** @returns {Buffer} a fresh random 256-bit key */
export function newKey() {
  return randomBytes(32);
}
