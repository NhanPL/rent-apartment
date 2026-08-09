import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const { readSqlFiles } = require('../scripts/migration-files');
const {
  assertSafeOutputPath,
  buildSchemaSnapshot
} = require('../scripts/export-schema');

const repoRoot = path.resolve(__dirname, '../..');
const migrationsDirectory = path.join(repoRoot, 'migrations');

describe('database migration source of truth', () => {
  it('loads every migration in lexical order with a stable checksum', () => {
    const files = readSqlFiles(migrationsDirectory);
    const names = files.map((file: { name: string }) => file.name);

    expect(names).toEqual([...names].sort());
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((file: { checksum: string }) => /^[0-9a-f]{64}$/.test(file.checksum))).toBe(true);
  });

  it('builds a generated snapshot from migrations without seed data', () => {
    const files = readSqlFiles(migrationsDirectory);
    const snapshot = buildSchemaSnapshot(files);

    expect(snapshot).toContain('GENERATED FILE - DO NOT EDIT');
    expect(snapshot).toContain('migrations/ is the only schema source of truth');
    files.forEach((file: { name: string }) => {
      expect(snapshot).toContain(`BEGIN MIGRATION: ${file.name}`);
    });
    expect(snapshot).not.toContain('000002_local_demo_data.sql');
  });

  it('does not allow generated snapshots inside migration or seed directories', () => {
    expect(() => assertSafeOutputPath(path.join(migrationsDirectory, 'database.sql'))).toThrow();
    expect(() => assertSafeOutputPath(path.join(repoRoot, 'seeds', 'database.sql'))).toThrow();
    expect(() => assertSafeOutputPath(path.join(os.tmpdir(), 'database.sql'))).not.toThrow();
  });

  it('keeps generated database.sql snapshots out of version control', () => {
    const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');

    expect(gitignore).toMatch(/^\/database\.sql$/m);
  });

  it('documents only the migration runner as the database bootstrap path', () => {
    const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');

    expect(readme).toContain('npm run db:migrate');
    expect(readme).toContain('npm run db:seed');
    expect(readme).not.toMatch(/psql[^\n]*database\.sql/i);
    expect(readme).not.toContain('/ `password`');
  });
});
