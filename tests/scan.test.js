import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { scan } from '../scripts/scan-secrets.mjs';

test('scanner flags secrets, personal emails and the sheet export; ignores safe content', () => {
  const d = mkdtempSync(join(tmpdir(), 'scan-'));
  writeFileSync(join(d, 'ok.js'), 'const a = "hello"; // you@example.com, ann@example.com');
  assert.deepEqual(scan(d), []);
  writeFileSync(join(d, 'k.js'), 'x="sk-ant-' + 'a'.repeat(30) + '"');
  writeFileSync(join(d, 'e.md'), 'contact jane.doe' + '@gmail.com');
  writeFileSync(join(d, '.env.local'), 'A=1');
  writeFileSync(join(d, 'monthly_costs_data.js'), 'x');
  writeFileSync(join(d, 'm.txt'), `MASTER_KEYS='{"v1":"${'A'.repeat(44)}"}'`);
  mkdirSync(join(d, 'private')); writeFileSync(join(d, 'private', 'data.js'), 'sk-ant-' + 'b'.repeat(30));
  const why = scan(d).map(([f, w]) => `${f}:${w}`).join('|');
  for (const need of ['k.js:Anthropic key', 'e.md:email address', '.env.local:env file', 'monthly_costs_data.js:spreadsheet', 'm.txt:Master key value']) assert.ok(why.includes(need), need + ' in ' + why);
  assert.ok(!why.includes('private'));
});

test('env files and the sheet export are fine when Git ignores them, blocked when it does not', () => {
  const d = mkdtempSync(join(tmpdir(), 'scan-git-'));
  execFileSync('git', ['init', '-q'], { cwd: d });
  writeFileSync(join(d, '.gitignore'), '.env.*\nmonthly_costs_data.js\n');
  writeFileSync(join(d, '.env.local'), 'A=1');
  writeFileSync(join(d, 'monthly_costs_data.js'), 'x');
  assert.deepEqual(scan(d), []);
  writeFileSync(join(d, '.gitignore'), '');
  const why = scan(d).map(([f, w]) => `${f}:${w}`).join('|');
  assert.ok(why.includes('.env.local:env file') && why.includes('monthly_costs_data.js:spreadsheet'), why);
});
