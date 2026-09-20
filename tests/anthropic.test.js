import test from 'node:test';
import assert from 'node:assert/strict';
import { anthropicClient } from '../src/lib/anthropic.js';

test('builds the Messages API request and joins text blocks', async () => {
  let seen;
  const c = anthropicClient({ apiKey: 'k', model: 'm', fetchImpl: async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'a' }, { type: 'x' }, { type: 'text', text: 'b' }] }) }; } });
  assert.equal(await c.complete({ prompt: 'hi', images: [{ mediaType: 'image/png', data: 'AAA' }] }), 'ab');
  const body = JSON.parse(seen.init.body);
  assert.equal(seen.init.headers['x-api-key'], 'k');
  assert.equal(body.messages[0].content[0].type, 'image');
  assert.equal(body.messages[0].content[1].text, 'hi');
  assert.match(body.system, /untrusted/);
});
test('upstream errors do not leak details', async () => {
  const c = anthropicClient({ apiKey: 'k', model: 'm', fetchImpl: async () => ({ ok: false, status: 500 }) });
  await assert.rejects(c.complete({ prompt: 'x' }), (e) => e.code === 'not_available');
});
