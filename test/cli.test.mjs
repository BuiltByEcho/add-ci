import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const cli = new URL('../dist/cli.js', import.meta.url).pathname;


function makeNodePackage() {
  const dir = mkdtempSync(join(tmpdir(), 'add-ci-node-test-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'fixture-cli',
    scripts: {
      build: 'tsc',
      lint: 'eslint .',
      test: 'node --test',
      typecheck: 'tsc --noEmit'
    },
    devDependencies: { typescript: '^5.8.0' }
  }, null, 2));
  return dir;
}

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


test('generic framework creates package CI without Playwright files or deps', () => {
  const dir = makeNodePackage();
  const res = run([dir, '--backend', 'none', '--framework', 'generic', '--tier', '3', '--skip-install']);
  assert.equal(res.status, 0, res.stderr);
  const workflow = readFileSync(join(dir, '.github/workflows/ci.yml'), 'utf8');
  assert.match(workflow, /Node Package Checks/);
  assert.match(workflow, /npm run typecheck/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm run test/);
  assert.match(workflow, /npm pack --dry-run/);
  assert.doesNotMatch(workflow, /playwright|wait-on|Start dev server/);
  assert.equal(existsSync(join(dir, 'playwright.config.ts')), false);
  assert.equal(existsSync(join(dir, 'tests')), false);
  assert.equal(existsSync(join(dir, '.env.example')), false);
});

test('generic dry-run plans only workflow and no installs', () => {
  const dir = makeNodePackage();
  const res = run([dir, '--backend', 'none', '--framework', 'generic', '--tier', '2', '--dry-run']);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /generic Node\/package CI uses existing package scripts/);
  assert.match(res.stdout, /\.github\/workflows\/ci\.yml/);
  assert.doesNotMatch(res.stdout, /playwright\.config\.ts|@playwright\/test|wait-on/);
  assert.equal(existsSync(join(dir, '.github')), false);
});

test('--dry-run --json prints a machine-readable plan without writing files', () => {
  const dir = makeNodePackage();
  const res = run([dir, '--backend', 'none', '--framework', 'generic', '--tier', '3', '--dry-run', '--json']);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stderr, '');
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.mode, 'dry-run');
  assert.equal(parsed.plan.projectName, 'fixture-cli');
  assert.equal(parsed.plan.detected.framework, 'generic');
  assert.equal(parsed.plan.tier, 3);
  assert.deepEqual(parsed.plan.installs, []);
  assert.deepEqual(parsed.plan.files.map((file) => file.path), ['.github/workflows/ci.yml']);
  assert.equal(parsed.plan.files[0].action, 'create');
  assert.match(parsed.plan.notes.join('\n'), /generic Node\/package CI uses existing package scripts/);
  assert.equal(existsSync(join(dir, '.github')), false);
});

test('--dry-run --json marks existing files as skipped unless forced', () => {
  const dir = makeNodePackage();
  const githubDir = join(dir, '.github/workflows');
  const workflowPath = join(githubDir, 'ci.yml');
  mkdirSync(githubDir, { recursive: true });
  writeFileSync(workflowPath, 'name: Existing\n');

  const res = run([dir, '--backend', 'none', '--framework', 'generic', '--tier', '1', '--dry-run', '--json']);
  assert.equal(res.status, 0, res.stderr);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.plan.files[0].action, 'skip');
  assert.match(parsed.plan.files[0].reason, /use --force/);

  const forced = run([dir, '--backend', 'none', '--framework', 'generic', '--tier', '1', '--dry-run', '--json', '--force']);
  assert.equal(forced.status, 0, forced.stderr);
  const forcedParsed = JSON.parse(forced.stdout);
  assert.equal(forcedParsed.plan.files[0].action, 'overwrite');
});
