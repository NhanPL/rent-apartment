import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_STATUSES,
  CHARGE_TYPES,
  CONTRACT_STATUSES,
  INVOICE_STATUSES,
  PAYMENT_ENTRY_TYPES,
  PAYMENT_PROOF_STATUSES,
  PAYMENT_REQUEST_STATUSES,
  PAYMENT_STATUSES,
  ROOM_STATUSES,
  TENANT_STATUSES,
  USER_ROLES,
  UTILITY_READING_STATUSES,
  toDatabaseNumber,
  toDateString,
  toIsoTimestamp
} from '../src/shared/types/database';

const listTypeScriptFiles = (directory: string): string[] => readdirSync(directory).flatMap((name) => {
  const path = resolve(directory, name);
  return statSync(path).isDirectory() ? listTypeScriptFiles(path) : path.endsWith('.ts') ? [path] : [];
});

describe('database boundary type safety', () => {
  it('does not use any-based rows or wildcard projections', () => {
    for (const file of listTypeScriptFiles(resolve(process.cwd(), 'src'))) {
      const content = readFileSync(file, 'utf8');
      expect(content, file).not.toMatch(/Record<string,\s*any>|:\s*any\b|<any>/);
      expect(content, file).not.toMatch(/\bSELECT\s+(?:[a-z_][a-z0-9_]*\.)?\*/i);
      expect(content, file).not.toMatch(/\bRETURNING\s+\*/i);
      expect(content, file).not.toMatch(
        /(?:const|let)\s+[^;\n]+?=\s*await\s+(?:client\.)?query\(/
      );
    }
  });

  it('maps PostgreSQL scalar values explicitly', () => {
    expect(toDatabaseNumber('1234.50')).toBe(1234.5);
    expect(() => toDatabaseNumber('not-a-number')).toThrow(TypeError);
    expect(toDateString(new Date('2026-08-09T12:30:00.000Z'))).toBe('2026-08-09');
    expect(toIsoTimestamp('2026-08-09T12:30:00+00:00')).toBe('2026-08-09T12:30:00.000Z');
  });

  it('keeps TypeScript statuses represented in PostgreSQL migrations', () => {
    const migrationsDirectory = resolve(process.cwd(), '..', 'migrations');
    const migrationSql = readdirSync(migrationsDirectory)
      .filter((name) => name.endsWith('.sql'))
      .map((name) => readFileSync(resolve(migrationsDirectory, name), 'utf8'))
      .join('\n');
    const statuses = [
      ...USER_ROLES,
      ...ACCOUNT_STATUSES,
      ...ROOM_STATUSES,
      ...CONTRACT_STATUSES,
      ...INVOICE_STATUSES,
      ...UTILITY_READING_STATUSES,
      ...PAYMENT_STATUSES,
      ...PAYMENT_ENTRY_TYPES,
      ...PAYMENT_REQUEST_STATUSES,
      ...PAYMENT_PROOF_STATUSES,
      ...TENANT_STATUSES,
      ...CHARGE_TYPES
    ];
    for (const status of new Set(statuses)) expect(migrationSql).toContain(`'${status}'`);
  });
});
