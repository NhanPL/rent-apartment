import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { writeAuditLog } from '../src/shared/services/audit-log.service';

describe('audit log service', () => {
  it('redacts credentials, asset identifiers, and URLs before persisting snapshots', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });

    await writeAuditLog({ query } as never, {
      actorUserId: '00000000-0000-4000-8000-000000000001',
      actorRole: 'MANAGER',
      managerUserId: '00000000-0000-4000-8000-000000000001',
      action: 'USER_PASSWORD_CHANGED',
      entityType: 'app_user',
      entityId: '00000000-0000-4000-8000-000000000001',
      metadata: {
        method: 'SELF_SERVICE',
        token: 'do-not-store',
        nested: { file_url: 'https://example.test/private.jpg' }
      },
      before: { password: 'old-password', displayName: 'Manager' },
      after: {
        passwordHash: 'new-hash',
        public_id: 'private/asset',
        evidence: 'https://example.test/evidence.jpg',
        accountStatus: 'ACTIVE'
      }
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [, params] = query.mock.calls[0];
    expect(params.slice(0, 6)).toEqual([
      '00000000-0000-4000-8000-000000000001',
      'MANAGER',
      '00000000-0000-4000-8000-000000000001',
      'USER_PASSWORD_CHANGED',
      'APP_USER',
      '00000000-0000-4000-8000-000000000001'
    ]);
    expect(JSON.parse(params[9])).toEqual({
      method: 'SELF_SERVICE',
      token: '[REDACTED]',
      nested: { file_url: '[REDACTED]' }
    });
    expect(JSON.parse(params[10])).toEqual({
      password: '[REDACTED]',
      displayName: 'Manager'
    });
    expect(JSON.parse(params[11])).toEqual({
      passwordHash: '[REDACTED]',
      public_id: '[REDACTED]',
      evidence: '[REDACTED_URL]',
      accountStatus: 'ACTIVE'
    });
    expect(JSON.stringify(params)).not.toContain('do-not-store');
    expect(JSON.stringify(params)).not.toContain('private/asset');
  });

  it('defines an immutable audit table in the migration', () => {
    const migration = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/20260805b_audit_log.sql'),
      'utf8'
    );
    const schema = fs.readFileSync(path.resolve(__dirname, '../../database.sql'), 'utf8');

    expect(schema).toContain('CREATE TABLE IF NOT EXISTS audit_log');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON audit_log');
    expect(migration).toContain('RAISE EXCEPTION');
  });
});
