const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const dotenv = require('dotenv');

const repoRoot = path.resolve(__dirname, '..', '..');
const backendRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(backendRoot, '.env'), override: true });
dotenv.config();

const args = new Set(process.argv.slice(2));
const includeSeeds = args.has('--seed');
const dryRun = args.has('--dry-run');
const help = args.has('--help') || args.has('-h');

if (help) {
  console.log(`Usage: node scripts/migrate.js [--seed] [--dry-run]

Options:
  --seed     Run schema migrations, then optional local seed files.
  --dry-run  Print pending files without applying them.
`);
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required to run migrations.');
  process.exit(1);
}

const getSslConfig = () => {
  const isSupabaseHost = databaseUrl.includes('.supabase.co');
  const dbSsl = process.env.DB_SSL;
  const shouldUseSsl = dbSsl === 'true' || (dbSsl !== 'false' && isSupabaseHost);

  if (!shouldUseSsl) {
    return undefined;
  }

  return {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
  };
};

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: getSslConfig()
});

const migrationFilePattern = /^([0-9][0-9A-Za-z-]*)_(.+)\.sql$/;

const readSqlFiles = (directory) => {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files = fs
    .readdirSync(directory)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();

  const seenVersions = new Set();

  return files.map((fileName) => {
    const match = fileName.match(migrationFilePattern);
    if (!match) {
      throw new Error(`Invalid migration file name: ${fileName}. Use <version>_<name>.sql.`);
    }

    const version = match[1];
    if (seenVersions.has(version)) {
      throw new Error(`Duplicate migration version ${version} in ${directory}.`);
    }
    seenVersions.add(version);

    const fullPath = path.join(directory, fileName);
    const sql = fs.readFileSync(fullPath, 'utf8');

    return {
      version,
      name: fileName,
      path: fullPath,
      checksum: crypto.createHash('sha256').update(sql).digest('hex'),
      sql
    };
  });
};

const ensureLedger = async (client, tableName) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      version text PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
};

const getApplied = async (client, tableName) => {
  const { rows: tableRows } = await client.query('SELECT to_regclass($1) AS table_name', [tableName]);
  if (!tableRows[0].table_name) {
    return new Map();
  }

  const { rows } = await client.query(`SELECT version, checksum FROM ${tableName}`);
  return new Map(rows.map((row) => [row.version, row.checksum]));
};

const applyFiles = async (client, { directory, tableName, label }) => {
  const files = readSqlFiles(directory);
  if (!dryRun) {
    await ensureLedger(client, tableName);
  }
  const applied = await getApplied(client, tableName);

  let appliedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const appliedChecksum = applied.get(file.version);

    if (appliedChecksum) {
      if (appliedChecksum !== file.checksum) {
        throw new Error(
          `${label} ${file.name} was already applied with a different checksum. ` +
            'Create a new migration instead of editing an applied file.'
        );
      }

      skippedCount += 1;
      console.log(`[skip] ${label} ${file.name}`);
      continue;
    }

    if (dryRun) {
      appliedCount += 1;
      console.log(`[pending] ${label} ${file.name}`);
      continue;
    }

    console.log(`[apply] ${label} ${file.name}`);
    await client.query('BEGIN');
    try {
      await client.query(file.sql);
      await client.query(`INSERT INTO ${tableName} (version, name, checksum) VALUES ($1, $2, $3)`, [
        file.version,
        file.name,
        file.checksum
      ]);
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

    const changedLabel = dryRun ? 'pending' : 'applied';
    console.log(
      `Done. Migrations: ${migrations.appliedCount} ${changedLabel}, ${migrations.skippedCount} skipped, ${migrations.totalCount} total.`
    );

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
