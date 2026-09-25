import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCode, cleanEmail, emailCookieOptions, EMAIL_COOKIE_MAX_AGE } from '../src/lib/otp-login.js';
import { codeHtml, loginHtml, passwordHtml } from '../src/lib/pages.js';

test('codes: digits only, 6 to 10, pasted spaces/dashes tolerated', () => {
  assert.equal(cleanCode('123456'), '123456');
  assert.equal(cleanCode(' 123 456 '), '123456');
  assert.equal(cleanCode('123-456'), '123456');
  assert.equal(cleanCode('12345'), null);
  assert.equal(cleanCode('12345a'), null);
  assert.equal(cleanCode(null), null);
  assert.equal(cleanCode('12345678'), '12345678');
});
test('emails normalized, junk rejected', () => {
  assert.equal(cleanEmail('  Ann@Example.COM '), 'ann@example.com');
  assert.equal(cleanEmail('nope'), null);
  assert.equal(cleanEmail(undefined), null);
});
test('email cookie is httpOnly, short-lived, secure on https', () => {
  const o = emailCookieOptions(true);
  assert.deepEqual([o.httpOnly, o.secure, o.sameSite, o.maxAge], [true, true, 'lax', EMAIL_COOKIE_MAX_AGE]);
  assert.equal(emailCookieOptions(false).secure, false);
});
test('pages: password step escapes the address, posts to /auth/password, offers a code instead; no script', () => {
  const h = passwordHtml({ email: '<b>ann@example.com</b>', message: 'Nope' });
  assert.match(h, /action="\/auth\/password"/);
  assert.match(h, /type="password"/);
  assert.match(h, /name="send_code" value="1"/);
  assert.ok(!h.includes('<b>ann@example.com</b>') && h.includes('&lt;b&gt;ann@example.com&lt;/b&gt;'));
  assert.ok(!/<script/i.test(h));
});

test('pages: code step escapes the address and posts to /auth/verify; no script anywhere', () => {
  const h = codeHtml({ email: '<b>ann@example.com</b>', message: 'Oops' });
  assert.match(h, /action="\/auth\/verify"/);
  assert.match(h, /autocomplete="one-time-code"/);
  assert.ok(!h.includes('<b>ann@example.com</b>') && h.includes('&lt;b&gt;ann@example.com&lt;/b&gt;'));
  assert.match(h, /Oops/);
  assert.ok(!/<script/i.test(h + loginHtml()));
  assert.match(loginHtml(), />Continue</);
  assert.ok(new RegExp('^' + h.match(/pattern="([^"]+)"/)[1] + '$').test('123 456'));
});
