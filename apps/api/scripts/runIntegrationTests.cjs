const { config } = require('dotenv');
const { spawnSync } = require('node:child_process');

config({ path: '.env' });

if (process.env.RUN_INTEGRATION_TESTS !== 'true') {
  console.error('Integration tests make and drop tenant schemas. Set RUN_INTEGRATION_TESTS=true to run them.');
  process.exit(2);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL must point to a dedicated test database.');
  process.exit(2);
}

let databaseName;
try {
  databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
} catch {
  console.error('DATABASE_URL is not a valid URL.');
  process.exit(2);
}

if (!/(^|[_-])test([_-]|$)/i.test(databaseName) && process.env.UNIVOTE_TEST_DATABASE_CONFIRMED !== 'true') {
  console.error(
    'Use a database with "test" in its name, or set UNIVOTE_TEST_DATABASE_CONFIRMED=true after confirming this is a disposable test database.'
  );
  process.exit(2);
}

const runner = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(runner, ['jest', '--testPathPattern=tests/integration', '--runInBand'], {
  stdio: 'inherit',
  env: { ...process.env, RUN_INTEGRATION_TESTS: 'true' },
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
