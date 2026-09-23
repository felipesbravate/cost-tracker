import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Every Figma variable must exist in the :root block of the Okara stylesheet (src/ui/okara.css) with the same value,
// and the app's short aliases must point at the right Figma variable.
const css = readFileSync(new URL('../src/ui/okara.css', import.meta.url), 'utf8');
const root = css.slice(css.indexOf(':root{'), css.indexOf('*{ box-sizing'));
const decl = {};
for (const m of root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) decl[m[1]] = m[2].trim();
const figma = JSON.parse(readFileSync(new URL('./figma-tokens.json', import.meta.url), 'utf8'));
const cssName = (collection, name) => '--' + name.toLowerCase().replace(/\//g, '-');

test('every Figma variable is in :root with the same value', () => {
  for (const [collection, vars] of Object.entries(figma)) {
    if (collection.startsWith('_')) continue;
    for (const [name, value] of Object.entries(vars)) {
      const key = cssName(collection, name);
      const got = decl[key];
      assert.ok(got !== undefined, `${key} (Figma ${collection}/${name}) is missing`);
      const want = typeof value === 'number' ? (collection === 'Opacity' ? String(value) : value + 'px') : value;
      assert.equal(got.toLowerCase(), want, `${key}: code has ${got}, Figma has ${want}`);
    }
  }
});

test('app aliases point at their Figma variable', () => {
  const alias = {
    '--page': 'surface-body', '--surface': 'surface-primary', '--surface-2': 'surface-secondary', '--ink': 'text-primary',
    '--ink-2': 'text-secondary', '--ink-muted': 'text-muted', '--border-card': 'border-default', '--on-primary': 'action-secondey',
    '--accent': 'action-accent', '--accent-soft': 'surface-accent-light', '--critical': 'status-fail', '--good': 'status-success',
    '--state-ink-hover': 'action-hover', '--state-ink-press': 'action-press', '--state-surface2-hover': 'action-recessed-hover',
    '--state-surface2-press': 'action-recessed-press', '--state-border-hover': 'border-hover',
    // data colours, as the Cost-tracker screens bind them
    '--income': 'data-purple', '--expense': 'data-pink', '--invest': 'data-light-blue', '--additional': 'data-pink',
    '--group-fixed': 'data-purple', '--group-variable': 'data-light-blue', '--group-extra': 'data-orange', '--group-additional': 'data-pink',
    '--badge-fixed': 'surface-accent', '--chart-income': 'surface-accent', '--chart-expense': 'data-pink', '--chart-invest': 'data-lime',
    '--kpi-income': 'surface-accent', '--kpi-expense': 'data-pink', '--kpi-invest': 'data-lime', '--alloc-extra': 'data-blue',
  };
  for (const [a, target] of Object.entries(alias)) assert.equal(decl[a], `var(--${target})`, a);
});

test('no hard-coded copy of a Figma colour is left outside :root (use the token)', () => {
  const body = css.slice(css.indexOf('*{ box-sizing'))
    .replace(/\/\*[\s\S]*?\*\//g, '')          // comments may quote old values
    .replace(/ctx\.fillStyle = '#fff'/, '');    // canvas backdrop for image conversion
  const colours = new Set(Object.values(figma.Color).filter(v => /^#/.test(v)));
  const hits = [...body.matchAll(/#[0-9a-fA-F]{6}\b/g)].map(m => m[0].toLowerCase()).filter(h => colours.has(h) && h !== '#ffffff');
  assert.deepEqual(hits, [], 'use var(--…) instead of these hex literals');
});

test('nothing depends on the Primitives collection', () => {
  assert.equal(/--primitive-/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), false, 'a --primitive-* token is still referenced');
});
