const path = require('path');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const { readSqlFiles } = require('./migration-files');

const repoRoot = path.resolve(__dirname, '..', '..');
const backendRoot = path.resolve(__dirname, '..');

const initialAppEnvironment = process.env.APP_ENV
  || (process.env.NODE_ENV === 'production' ? 'production' : 'development');
if (initialAppEnvironment !== 'production' && initialAppEnvironment !== 'staging') {
  dotenv.config({ path: path.join(repoRoot, '.env') });
  dotenv.config({ path: path.join(backendRoot, '.env'), override: true });
  dotenv.config();
}

const args = new Set(process.argv.slice(2));
const includeSeeds = args.has('--seed');
const dryRun = args.has('--dry-run');
const verifyOnly = args.has('--verify');
const help = args.has('--help') || args.has('-h');

if (help) {
  console.log(`Usage: node scripts/migrate.js [--seed] [--dry-run] [--verify]

Options:
  --seed     Run schema migrations, then optional local seed files.
  --dry-run  Print pending files without applying them.
  --verify   Verify every local migration is applied without changing the database.
`);
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required to run migrations.');
  process.exit(1);
}

const getSslConfig = () => {
  const appEnvironment = process.env.APP_ENV
    || (process.env.NODE_ENV === 'production' ? 'production' : 'development');
  const isDeployed = appEnvironment === 'staging' || appEnvironment === 'production';
  const isSupabaseHost = new URL(databaseUrl).hostname.endsWith('.supabase.co');
  const dbSsl = process.env.DB_SSL || (isDeployed || isSupabaseHost ? 'true' : 'false');
  const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED
    || (dbSsl === 'true' ? 'true' : 'false');

  if (isDeployed && dbSsl !== 'true') {
    throw new Error(`DB_SSL must be true when APP_ENV=${appEnvironment}.`);
  }
  if (isDeployed && rejectUnauthorized !== 'true') {
    throw new Error(
      `DB_SSL_REJECT_UNAUTHORIZED must be true when APP_ENV=${appEnvironment}.`
    );
  }
  if (dbSsl === 'false' && rejectUnauthorized === 'true') {
    throw new Error('DB_SSL_REJECT_UNAUTHORIZED cannot be true when DB_SSL is false.');
  }

  if (dbSsl !== 'true') {
    return undefined;
  }

  return {
    rejectUnauthorized: rejectUnauthorized === 'true',
    ...(process.env.DB_SSL_CA
      ? { ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n').trim() }
      : {})
  };
};

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: getSslConfig()
});

const packageVersion = require('../package.json').version;
const applicationVersion = (process.env.APP_VERSION || packageVersion).trim();
const migrationLockTimeoutMs = Number(process.env.MIGRATION_LOCK_TIMEOUT_MS || 5000);
const migrationStatementTimeoutMs = Number(process.env.MIGRATION_STATEMENT_TIMEOUT_MS || 900000);

const assertPositiveInteger = (value, name) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
};

assertPositiveInteger(migrationLockTimeoutMs, 'MIGRATION_LOCK_TIMEOUT_MS');
assertPositiveInteger(migrationStatementTimeoutMs, 'MIGRATION_STATEMENT_TIMEOUT_MS');

const ensureLedger = async (client, tableName) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      version text PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL,
      application_version text,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(
    `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS application_version text`
  );
};

const getApplied = async (client, tableName) => {
  const { rows: tableRows } = await client.query('SELECT to_regclass($1) AS table_name', [tableName]);
  if (!tableRows[0].table_name) {
    return new Map();
  }

  const { rows: columnRows } = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = $1
         AND column_name = 'application_version'
     ) AS has_application_version`,
    [tableName]
  );
  const applicationVersionColumn = columnRows[0].has_application_version
    ? 'application_version'
    : 'NULL::text AS application_version';
  const { rows } = await client.query(
    `SELECT version, checksum, ${applicationVersionColumn} FROM ${tableName}`
  );
  return new Map(rows.map((row) => [row.version, row]));
};

const applyFiles = async (client, { directory, tableName, label }) => {
  const files = readSqlFiles(directory);
  if (!dryRun && !verifyOnly) {
    await ensureLedger(client, tableName);
  }
  const applied = await getApplied(client, tableName);

  let appliedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const appliedMigration = applied.get(file.version);

    if (appliedMigration) {
      if (appliedMigration.checksum !== file.checksum) {
        throw new Error(
          `${label} ${file.name} was already applied with a different checksum. ` +
            'Create a new migration instead of editing an applied file.'
        );
      }

      skippedCount += 1;
      console.log(
        `[skip] ${label} ${file.name}` +
          (appliedMigration.application_version
            ? ` (app ${appliedMigration.application_version})`
            : '')
      );
      continue;
    }

    if (verifyOnly) {
      throw new Error(`${label} ${file.name} has not been applied.`);
    }

    if (dryRun) {
      appliedCount += 1;
      console.log(`[pending] ${label} ${file.name}`);
      continue;
    }

    console.log(`[apply] ${label} ${file.name}`);
    await client.query('BEGIN');
    try {
      await client.query(`SELECT set_config('lock_timeout', $1, true)`, [
        `${migrationLockTimeoutMs}ms`
      ]);
      await client.query(`SELECT set_config('statement_timeout', $1, true)`, [
        `${migrationStatementTimeoutMs}ms`
      ]);
      await client.query(file.sql);
      await client.query(
        `INSERT INTO ${tableName} (version, name, checksum, application_version)
         VALUES ($1, $2, $3, $4)`,
        [file.version, file.name, file.checksum, applicationVersion]
      );
      await client.query('COMMIT');
      appliedCount += 1;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  return { appliedCount, skippedCount, totalCount: files.length };
};

const main = async () => {
  const appEnvironment = process.env.APP_ENV
    || (process.env.NODE_ENV === 'production' ? 'production' : 'development');
  if (includeSeeds && verifyOnly) {
    throw new Error('--seed and --verify cannot be used together.');
  }
  if (dryRun && verifyOnly) {
    throw new Error('--dry-run and --verify cannot be used together.');
  }
  if (includeSeeds && !dryRun && ['staging', 'production'].includes(appEnvironment)) {
    throw new Error(`Seed data cannot be applied when APP_ENV=${appEnvironment}.`);
  }

  const client = await pool.connect();

  try {
    const migrations = await applyFiles(client, {
      directory: path.join(repoRoot, 'migrations'),
      tableName: 'schema_migrations',
      label: 'migration'
    });

    let seeds = null;
    if (includeSeeds) {
      seeds = await applyFiles(client, {
        directory: path.join(repoRoot, 'seeds'),
        tableName: 'seed_migrations',
        label: 'seed'
      });
    }

    const changedLabel = verifyOnly ? 'verified' : dryRun ? 'pending' : 'applied';
    console.log(
      `Done. Migrations: ${migrations.appliedCount} ${changedLabel}, ${migrations.skippedCount} skipped, ${migrations.totalCount} total.`
    );

    if (verifyOnly) {
      console.log(`Database migration verification passed for application ${applicationVersion}.`);
    }

    if (seeds) {
      console.log(`Seeds: ${seeds.appliedCount} ${changedLabel}, ${seeds.skippedCount} skipped, ${seeds.totalCount} total.`);
    }
  } finally {
    client.release();
  }
};

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await pool.end();
    process.exit(1);
  });
