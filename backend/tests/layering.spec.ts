import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) => readFileSync(
  resolve(process.cwd(), 'src', 'modules', relativePath),
  'utf8'
);

describe('backend module boundaries', () => {
  it.each([
    'contracts/contracts.routes.ts',
    'tenants/tenants.routes.ts',
    'rental-registration/rental-registration.routes.ts'
  ])('%s keeps persistence and transactions outside the HTTP layer', (relativePath) => {
    const content = source(relativePath);
    expect(content).not.toMatch(/\b(?:SELECT|INSERT|UPDATE|DELETE)\b[\s\S]*\b(?:FROM|INTO|SET)\b/i);
    expect(content).not.toMatch(/\b(?:query|withTransaction|client\.query)\s*(?:<|\()/);
  });

  it.each([
    'contracts/contracts.service.ts',
    'tenants/tenant-management.service.ts',
    'rental-registration/rental-registration.service.ts'
  ])('%s does not own Express route registration', (relativePath) => {
    const content = source(relativePath);
    expect(content).not.toMatch(/\bRouter\s*\(/);
    expect(content).not.toMatch(/\brouter\.(?:get|post|put|patch|delete)\s*\(/);
    expect(content).not.toMatch(/\b(?:Request|Response)\b.*from ['"]express['"]/);
  });
});
