const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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

module.exports = {
  migrationFilePattern,
  readSqlFiles
};
