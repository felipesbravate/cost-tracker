import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trackerCsp } from '../src/lib/headers.js';
import { CATS } from '../src/tracker/model.js';

test('tracker CSP is strict in production', () => {
  const c = trackerCsp('abc');
  assert.match(c, /script-src 'self' 'nonce-abc' 'strict-dynamic'/);
  assert.ok(!/unsafe-eval/.test(c));
  assert.ok(!/script-src[^;]*unsafe-inline/.test(c));
  assert.match(c, /default-src 'none'/);
  assert.match(c, /frame-ancestors 'none'/);
  assert.match(c, /connect-src 'self';/);
});

test('the starter categories hold no personal data', () => {
  assert.ok(!/felipe|sbravate|barcelona/i.test(JSON.stringify(CATS)));
});

test('pdf.js is opened with eval disabled (hardening against CVE-2024-4367-style font exploits)', () => {
  const src = readFileSync(new URL('../src/tracker/reader.js', import.meta.url), 'utf8');
  assert.match(src, /getDocument\(\{[^}]*isEvalSupported:\s*false/);
});

test('no page source loads a third-party script host', () => {
  for (const f of ['../app/page.jsx', '../src/tracker/TrackerApp.jsx', '../src/tracker/reader.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/<script[^>]+src="https?:/.test(src) && !/cdnjs|jsdelivr|unpkg/.test(src), f);
  }
});
