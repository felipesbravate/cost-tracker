import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTracker, trackerCsp, newNonce } from '../src/lib/legacy.js';
import { readFileSync } from 'node:fs';

test('every script tag carries the nonce; no personal data or CDN hosts remain', () => {
  const n = newNonce();
  const html = renderTracker(n);
  const tags = html.match(/<script[^>]*>/g) || [];
  assert.ok(tags.length >= 4);
  for (const t of tags) assert.ok(t.includes(`nonce="${n}"`), t);
  assert.ok(!/felipe|sbravate|barcelona/i.test(html));
  assert.ok(!html.includes('cdnjs.cloudflare.com'));
  assert.ok(html.includes('/legacy/claude-shim.js') && html.includes('/legacy/taxonomy.js'));
  assert.ok(!html.includes('monthly_costs_data.js'));
});
test('CSP is strict', () => {
  const c = trackerCsp('abc');
  assert.match(c, /script-src 'self' 'nonce-abc'/);
  assert.ok(!/script-src[^;]*unsafe/.test(c));
  assert.match(c, /default-src 'none'/);
  assert.match(c, /frame-ancestors 'none'/);
});
test('template contains no real financial data', () => {
  const s = readFileSync(new URL('../public/legacy/taxonomy.js', import.meta.url), 'utf8');
  assert.ok(/years:\s*\[\]/.test(s));
});

test('pdf.js is opened with eval disabled (hardening against CVE-2024-4367-style font exploits)', () => {
  const html = readFileSync(new URL('../src/legacy/tracker.template.html', import.meta.url), 'utf8');
  assert.match(html, /getDocument\(\{[^}]*isEvalSupported:\s*false/);
});
