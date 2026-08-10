import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('backup operations', () => {
  it('schedules encrypted off-site backups with bounded permissions', () => {
    const workflow = read('.github/workflows/database-backup.yml');
    expect(workflow).toContain('cron: "17 18 * * *"');
    expect(workflow).toContain('environment: production-backup');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('get-bucket-versioning');
    expect(workflow).toContain('get-bucket-encryption');
    expect(workflow).toContain('get-bucket-lifecycle-configuration');
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).not.toContain('push:');
  });

  it('encrypts before upload and performs a real PostgreSQL restore check', () => {
    const script = read('scripts/backup-postgres.sh');
    const encryptionPosition = script.indexOf('openssl enc -aes-256-cbc');
    const uploadPosition = script.indexOf('upload_file "${encrypted_file}"');
    expect(encryptionPosition).toBeGreaterThan(0);
    expect(uploadPosition).toBeGreaterThan(encryptionPosition);
    expect(script).toContain('--sse aws:kms');
    expect(script).toContain('--checksum-algorithm SHA256');
    expect(script).toContain('--checksum-mode ENABLED');
    expect(script).toContain('sha256sum --check');
    expect(script).toContain('openssl enc -d -aes-256-cbc');
    expect(script).toContain('verified_dump_file');
    expect(script).toContain('pg_restore --list');
    expect(script).toMatch(/pg_restore \\\r?\n\s+--exit-on-error/);
    expect(script).toContain("SELECT count(*) FROM schema_migrations");
    expect(script).not.toContain('echo "$BACKUP_DATABASE_URL"');
  });

  it('defines daily, weekly and monthly retention classes', () => {
    const lifecycle = JSON.parse(read('ops/s3-backup-lifecycle.json')) as {
      Rules: Array<{ Filter: { Prefix: string }; Expiration: { Days: number } }>;
    };
    expect(lifecycle.Rules.map((rule) => rule.Filter.Prefix)).toEqual([
      'rent-apartment/daily/',
      'rent-apartment/weekly/',
      'rent-apartment/monthly/'
    ]);
    expect(lifecycle.Rules.map((rule) => rule.Expiration.Days)).toEqual([35, 98, 2555]);
  });
});
