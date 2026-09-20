import test from 'node:test';
import assert from 'node:assert/strict';
import { supabaseStores } from '../src/lib/supabase-stores.js';

// Minimal fake of the supabase-js query builder that, like PostgREST, silently caps each response.
function fakeClient(rows, cap) {
  return { from() {
    let list = rows.slice(), lo = 0, hi = Infinity;
    const q = {
      select() { return q; },
      eq(col, v) { list = list.filter((r) => r[col] === v); return q; },
      order(col) { list = list.sort((a, b) => (a[col] < b[col] ? -1 : 1)); return q; },
      range(a, b) { lo = a; hi = b; return q; },
      then(res) { res({ data: list.slice(lo, Math.min(hi + 1, lo + cap)), error: null }); },
    };
    return q;
  } };
}

test('docs.list returns every row even when the server caps responses', async () => {
  const rows = Array.from({ length: 3294 }, (_, i) => ({ user_id: 'u', collection: 'entries', doc_id: 'd' + String(i).padStart(5, '0') }));
  rows.push({ user_id: 'other', collection: 'entries', doc_id: 'x' });
  for (const cap of [1000, 100, 1]) {
    const got = await supabaseStores(fakeClient(rows.slice(0, cap === 1 ? 20 : rows.length), cap)).docs.list('u', 'entries');
    assert.equal(got.length, cap === 1 ? 20 : 3294, `cap ${cap}`);
    assert.equal(new Set(got.map((r) => r.doc_id)).size, got.length);
  }
});
