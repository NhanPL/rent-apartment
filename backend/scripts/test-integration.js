const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Pool } = require('pg');

const adminUrl = process.env.TEST_DATABASE_ADMIN_URL
  || 'postgres://postgres:postgres@localhost:5432/postgres';
const databaseName = `rentmate_integration_${crypto.randomBytes(8).toString('hex')}`;

const buildDatabaseUrl = (source, database) => {
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
};

const run = (command, args, env) => {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status || 1;
  return result.status === 0;
};

const main = async () => {
  const adminPool = new Pool({ connectionString: adminUrl });
  const databaseUrl = buildDatabaseUrl(adminUrl, databaseName);
  const testEnv = {
    ...process.env,
    APP_ENV: 'test',
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    DB_SSL: 'false'
  };

  try {
    await adminPool.query(`CREATE DATABASE ${databaseName}`);
    if (!run(process.execPath, ['scripts/migrate.js'], testEnv)) return;
    run(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['vitest', 'run', '--config', 'vitest.integration.config.ts'],
      testEnv
    );
  } finally {
    await adminPool.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname=$1 AND pid <> pg_backend_pid()`,
      [databaseName]
    );
    await adminPool.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await adminPool.end();
  }
};

main().catch((error) => {
  console.error('Unable to run PostgreSQL integration tests:', error);
  process.exitCode = 1;
});
