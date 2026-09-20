// Copies the pinned pdf.js build into public/vendor/pdfjs so the page never loads code from a CDN.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', 'pdfjs-dist', 'build');
const to = join(root, 'public', 'vendor', 'pdfjs');
if (!existsSync(from)) { console.warn('[vendor-pdfjs] pdfjs-dist not installed; skipping'); process.exit(0); }
mkdirSync(to, { recursive: true });
for (const f of ['pdf.min.js', 'pdf.worker.min.js']) {
  if (!existsSync(join(from, f))) { console.error(`[vendor-pdfjs] ${f} missing in pdfjs-dist (need 3.11.x)`); process.exit(1); }
  copyFileSync(join(from, f), join(to, f));
}
console.log('[vendor-pdfjs] copied pdf.js to public/vendor/pdfjs');
