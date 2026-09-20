// @ts-check
// Serves the tracker UI as an HTML document with a per-response CSP nonce.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const templatePath = join(here, '..', 'legacy', 'tracker.template.html');
// Read once in production; re-read on every request in development so edits show up without a restart.
let cached = process.env.NODE_ENV === 'production' ? readFileSync(templatePath, 'utf8') : null;
const template = () => cached ?? readFileSync(templatePath, 'utf8');

export const newNonce = () => randomBytes(16).toString('base64');

/**
 * Content-Security-Policy for the tracker page.
 * 'unsafe-inline' for styles is required by the design (inline style attributes); scripts are
 * nonce-gated, so injected markup cannot execute. No third-party script hosts.
 * @param {string} nonce
 */
export function trackerCsp(nonce) {
  return [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** Baseline headers for every response. @param {string} [csp] */
export function securityHeaders(csp) {
  /** @type {Record<string,string>} */
  const h = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
    'x-frame-options': 'DENY',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'strict-transport-security': 'max-age=63072000; includeSubDomains',
    'cache-control': 'no-store',
  };
  if (csp) h['content-security-policy'] = csp;
  return h;
}

/** @param {string} nonce @returns {string} full HTML document */
export function renderTracker(nonce) {
  const body = template().replace(/<script(?=[\s>])/g, `<script nonce="${nonce}"`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">${body}</body></html>`;
}
