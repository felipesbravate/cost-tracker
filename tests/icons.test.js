import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The design system's icon sets come in 10px, 12px and 20px. Nearly all are one drawing scaled; X (10px) and Euro / Dollar
// (10px and 12px) are redrawn per size and carry their own artwork in ICON_LIB. X is drawn at 10px and 12px.
const html = readFileSync(new URL('../src/legacy/tracker.template.html', import.meta.url), 'utf8');
const line = html.split('\n').find((l) => l.startsWith('window.ICON_LIB = '));
const lib = JSON.parse(line.slice('window.ICON_LIB = '.length).replace(/;$/, ''));

test('icons that are redrawn per size carry that size\'s artwork on its own frame', () => {
  const want = { x: ['10', '12'], euro: ['10', '12'], dollar: ['10', '12'] };
  for (const [name, sizes] of Object.entries(want)) {
    for (const s of sizes) {
      const a = lib[name].sizes && lib[name].sizes[s];
      assert.ok(a, `${name} has no ${s}px artwork`);
      assert.equal(a.viewBox, `0 0 ${s} ${s}`, `${name} ${s}px must be drawn on a ${s}x${s} frame`);
      const nums = [...a.d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
      assert.ok(nums.every((n) => n >= -0.01 && n <= Number(s) + 0.01), `${name} ${s}px has coordinates outside its frame`);
    }
  }
});

test('the 10px X is the small drawing: a 6x6 glyph centred in its 10px frame', () => {
  const nums = [...lib.x.sizes['10'].d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [2, 8, 2, 8]);
});

test('the 12px X (delete button, Cost-tracker 174:15198) is a 9x9 glyph centred in its 12px frame', () => {
  const nums = [...lib.x.sizes['12'].d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
  const r = (v) => Math.round(v * 100) / 100;
  assert.deepEqual([r(Math.min(...xs)), r(Math.max(...xs)), r(Math.min(...ys)), r(Math.max(...ys))], [1.53, 10.47, 1.53, 10.47]);
});

test('file-type icons: Document and Image are drawn on the exact 20px frame', () => {
  for (const name of ['document', 'image']) {
    assert.ok(lib[name], `${name} is missing`);
    assert.equal(lib[name].viewBox, '0 0 20 20', `${name} must use the 20x20 frame`);
    const nums = [...lib[name].d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
    assert.ok(nums.every((n) => n >= -0.01 && n <= 20.01), `${name} has coordinates outside its frame`);
  }
  assert.notEqual(lib.image.d, lib.document.d);
});
