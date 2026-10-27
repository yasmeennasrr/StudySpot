#!/usr/bin/env node
/**
 * One-command setup for StudySpot. Run from the repo root after cloning or pulling:
 *
 *   npm run setup
 *
 * It checks your tools, creates backend/.env, starts the local database (Docker),
 * installs all packages, creates the tables and loads the venue seed data. Safe to run
 * again at any time (for example after a `git pull` that added packages or migrations).
 *
 * Options:
 *   --no-docker   use the database already set in backend/.env (e.g. Supabase) instead of Docker
 *   --skip-seed   don't (re)load the venue seed data
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'backend');
const APP = join(ROOT, 'app');
const args = new Set(process.argv.slice(2));
const isWindows = process.platform === 'win32';

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
let step = 0;
const title = (s) => console.log(`\n${bold(`[${++step}] ${s}`)}`);
const ok = (s) => console.log(`    ${green('✔')} ${s}`);
const fail = (s, fix) => {
  console.error(`\n    ${red('✘')} ${s}`);
  if (fix) console.error(`\n    How to fix:\n${fix.split('\n').map((l) => `      ${l}`).join('\n')}\n`);
  console.error(`    Then run ${bold('npm run setup')} again.\n`);
  process.exit(1);
};

/** Runs a command; returns { ok, out }. `show` streams output to the terminal. */
function run(cmd, cmdArgs, { cwd = ROOT, show = false } = {}) {
  const r = spawnSync(cmd, cmdArgs, {
    cwd,
    shell: isWindows, // npm, npx and docker are .cmd/.exe shims on Windows
    stdio: show ? 'inherit' : 'pipe',
    encoding: 'utf8',
  });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(), missing: r.error?.code === 'ENOENT' };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readEnv(file) {
  const env = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

async function main() {
  console.log(bold('StudySpot setup'));

  // 1. Tools ------------------------------------------------------------------
  title('Checking your tools');
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    fail(`Node.js ${process.versions.node} is too old (need 20 or newer).`, 'Install the LTS version from https://nodejs.org');
  }
  ok(`Node.js ${process.versions.node}`);
  const git = run('git', ['--version']);
  git.ok ? ok(git.out) : console.log('    - git not found (only needed to push your work)');

  // 2. backend/.env -----------------------------------------------------------
  title('Settings file (backend/.env)');
  const envFile = join(BACKEND, '.env');
  if (!existsSync(envFile)) {
    copyFileSync(join(BACKEND, '.env.example'), envFile);
    ok('Created backend/.env from .env.example (works as-is with Docker)');
  } else {
    ok('backend/.env already exists (kept as-is)');
  }
  const env = readEnv(envFile);
  if (!env.DATABASE_URL) fail('DATABASE_URL is empty in backend/.env.', 'Copy the line from backend/.env.example.');
  const dbHost = new URL(env.DATABASE_URL).hostname;
  const useDocker = !args.has('--no-docker') && ['localhost', '127.0.0.1', '::1'].includes(dbHost);

  // 3. Database -----------------------------------------------------------------
  title(useDocker ? 'Starting the local database (Docker)' : `Using the database in backend/.env (${dbHost})`);
  if (useDocker) {
    const docker = run('docker', ['info']);
    if (docker.missing) {
      fail(
        'Docker is not installed.',
        'Install Docker Desktop from https://www.docker.com/products/docker-desktop\nOpen it and wait until it says "Engine running".\n(Or use Supabase: put its connection string in backend/.env and run: npm run setup -- --no-docker)',
      );
    }
    if (!docker.ok) {
      fail(
        'Docker is installed but not running.',
        'Open Docker Desktop and wait until the bottom-left says "Engine running".\nIf it mentions WSL, run: wsl --update',
      );
    }
    ok('Docker is running');
    const up = run('docker', ['compose', 'up', '-d', 'db'], { show: true });
    if (!up.ok) fail('Could not start the database container.', 'Run: docker compose logs db   and send the output to M1.');
    process.stdout.write('    Waiting for the database to be ready');
    let status = '';
    for (let i = 0; i < 60; i++) {
      status = run('docker', ['inspect', '-f', '{{.State.Health.Status}}', 'studyspot-db']).out;
      if (status === 'healthy') break;
      process.stdout.write('.');
      await sleep(2000);
    }
    console.log('');
    if (status !== 'healthy') fail(`The database did not become ready (status: ${status || 'unknown'}).`, 'Run: docker compose logs db   and send the output to M1.');
    ok('Database is ready on localhost:5432');
    // Separate database for the integration tests (they wipe it), so `npm run test:int` works.
    const testDb = run('docker', ['exec', 'studyspot-db', 'createdb', '-U', 'studyspot', 'studyspot_test']);
    if (testDb.ok) ok('Created the test database studyspot_test (used by npm run test:int)');
    else if (/already exists/.test(testDb.out)) ok('Test database studyspot_test is ready');
    else console.log('    - Could not create the test database studyspot_test (only needed for npm run test:int)');
  } else {
    ok('Skipping Docker');
  }

  // 4. Packages -----------------------------------------------------------------
  title('Installing backend packages (first time takes 1-2 minutes)');
  const lock = existsSync(join(BACKEND, 'package-lock.json'));
  const install = run('npm', [lock ? 'ci' : 'install', '--no-audit', '--no-fund'], { cwd: BACKEND, show: true });
  if (!install.ok) fail('npm could not install the packages.', 'Check your internet connection. If it says EPERM, close VS Code / the running server and try again.');
  ok('Packages installed');

  // 5. Tables -------------------------------------------------------------------
  title('Creating / updating the database tables (migrations)');
  const migrate = run('npm', ['run', 'migration:run'], { cwd: BACKEND, show: true });
  if (!migrate.ok) fail('Migrations failed.', 'Make sure the database is running, and DATABASE_URL in backend/.env is correct.');
  ok('Tables are up to date');

  // 6. Sample data ----------------------------------------------------------------
  if (!args.has('--skip-seed')) {
    title('Loading venue seed data');
    const seed = run('npm', ['run', 'seed'], { cwd: BACKEND, show: true });
    if (!seed.ok) fail('Loading the seed data failed.', 'Check backend/seed/*.json for a typo (the error above names the entry).');
    ok('Venue seed data loaded');
  }

  // 7. Flutter app (only once M5 has created it) ------------------------------------
  if (existsSync(join(APP, 'pubspec.yaml'))) {
    title('Flutter app packages');
    const flutter = run('flutter', ['pub', 'get'], { cwd: APP, show: true });
    flutter.ok ? ok('flutter pub get done') : console.log('    - Flutter not installed or failed (only needed by M5/M6): https://docs.flutter.dev/get-started/install');
  }

  console.log(`\n${green(bold('All set!'))}

  Start the backend:   ${bold('npm run dev')}
  API docs:            http://localhost:3000/api/docs
  Health check:        http://localhost:3000/api/v1/health
  Dev sign-in:         dev@studyspot.test / devpass123  (POST /api/v1/auth/login for a token)

  Before your first pull request, read CONTRIBUTING.md.
`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
