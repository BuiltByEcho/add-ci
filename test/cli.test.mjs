import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const cli = new URL('../dist/cli.js', import.meta.url).pathname;

function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), 'add-ci-test-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'fixture-app',
    scripts: { dev: 'vite', lint: 'echo lint', typecheck: 'echo typecheck' },
    dependencies: { vite: '^7.0.0' }
  }, null, 2));
  return dir;
}

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

test('--dry-run prints planned files without writing', () => {
  const dir = makeProject();
  const res = run([dir, '--backend', 'none', '--framework', 'vite', '--tier', '2', '--skip-install', '--dry-run']);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Dry run/);
  assert.match(res.stdout, /Would create\/update:/);
  assert.match(res.stdout, /\.github\/workflows\/ci\.yml/);
  assert.equal(existsSync(join(dir, '.github')), false);
  assert.equal(existsSync(join(dir, 'playwright.config.ts')), false);
});

test('scaffolds tier 2 files when not a dry run', () => {
  const dir = makeProject();
  const res = run([dir, '--backend', 'none', '--framework', 'vite', '--tier', '2', '--skip-install']);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(existsSync(join(dir, '.github/workflows/ci.yml')), true);
  assert.equal(existsSync(join(dir, 'playwright.config.ts')), true);
  assert.equal(existsSync(join(dir, 'tests/smoke/home.spec.ts')), true);
});
