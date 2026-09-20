// Prints a fresh master key entry. Put the output in your hosting provider's secret store (NOT in Git).
import { randomBytes } from 'node:crypto';
const v = process.argv[2] || 'v1';
console.log(`MASTER_KEYS='${JSON.stringify({ [v]: randomBytes(32).toString('base64') })}'`);
console.log(`MASTER_KEY_ACTIVE=${v}`);
console.error('\nBack this key up somewhere safe and offline. If it is lost, all encrypted data is unrecoverable. To rotate, add a second version to MASTER_KEYS, switch MASTER_KEY_ACTIVE, and run: npm run rewrap');
