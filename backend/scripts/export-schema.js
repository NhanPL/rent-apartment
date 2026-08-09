const fs = require('fs');
const path = require('path');
const { readSqlFiles } = require('./migration-files');

const repoRoot = path.resolve(__dirname, '..', '..');
const migrationsDirectory = path.join(repoRoot, 'migrations');

const buildSchemaSnapshot = (files) => {
  const header = `-- GENERATED FILE - DO NOT EDIT
-- Generated from the ordered files in migrations/.
-- migrations/ is the only schema source of truth.
-- Create new databases with: cd backend && npm run db:migrate
-- This snapshot is for inspection or tooling that explicitly requires one SQL file.
`;

  const body = files.map((file) => `
-- BEGIN MIGRATION: ${file.name} (${file.checksum})
${file.sql.trim()}
-- END MIGRATION: ${file.name}
`).join('\n');

  return `${header}${body}`;
};

const getOutputPath = (argv) => {
  const outputIndex = argv.indexOf('--output');
  if (outputIndex < 0 || !argv[outputIndex + 1]) {
    throw new Error('Missing --output <path>.');
  }
  return path.resolve(process.cwd(), argv[outputIndex + 1]);
};

const assertSafeOutputPath = (outputPath) => {
  const protectedDirectories = [
    path.join(repoRoot, 'migrations'),
    path.join(repoRoot, 'seeds')
  ];

  if (protectedDirectories.some((directory) => (
    outputPath === directory || outputPath.startsWith(`${directory}${path.sep}`)
  ))) {
    throw new Error('Schema snapshots cannot be written inside migrations/ or seeds/.');
  }
};

const main = () => {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: node scripts/export-schema.js --output <path>');
    return;
  }

  const outputPath = getOutputPath(process.argv.slice(2));
  assertSafeOutputPath(outputPath);

  const files = readSqlFiles(migrationsDirectory);
  if (files.length === 0) {
    throw new Error('No migration files were found.');
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buildSchemaSnapshot(files), 'utf8');
  console.log(`Generated schema snapshot from ${files.length} migrations: ${outputPath}`);
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = {
  assertSafeOutputPath,
  buildSchemaSnapshot,
  getOutputPath
};
