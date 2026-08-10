import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveSmtpSettings } from '../src/config/env';

const repoRoot = path.resolve(__dirname, '../..');

describe('container and environment configuration', () => {
  it('uses a multi-stage, pinned, non-root backend image', () => {
    const dockerfile = fs.readFileSync(path.join(repoRoot, 'backend', 'Dockerfile'), 'utf8');
    expect(dockerfile).toContain('ARG NODE_VERSION=22.18.0');
    expect(dockerfile.match(/^FROM /gm)?.length).toBeGreaterThanOrEqual(3);
    expect(dockerfile).toContain('npm ci --omit=dev');
    expect(dockerfile).toContain('COPY --from=build');
    expect(dockerfile).toContain('USER node');
    expect(dockerfile).toContain("+'/ready'");
    expect(dockerfile).not.toMatch(/COPY .*\.env/);
  });

  it('excludes secrets, dependencies, artifacts and frontend from the backend context', () => {
    const dockerignore = fs.readFileSync(path.join(repoRoot, '.dockerignore'), 'utf8');
    expect(dockerignore).toMatch(/^\.env$/m);
    expect(dockerignore).toMatch(/^\*\*\/node_modules$/m);
    expect(dockerignore).toMatch(/^\*\*\/dist$/m);
    expect(dockerignore).toMatch(/^front-end$/m);
  });

  it('requires an explicit, complete SMTP configuration', () => {
    expect(resolveSmtpSettings({
      enabled: 'false', host: '', user: '', password: '', fromEmail: ''
    }).enabled).toBe(false);
    expect(() => resolveSmtpSettings({
      enabled: 'false', host: 'smtp.example.test', user: '', password: '', fromEmail: ''
    })).toThrow('SMTP_ENABLED must be true');
    expect(() => resolveSmtpSettings({
      enabled: 'true', host: 'smtp.example.test', user: '', password: '', fromEmail: ''
    })).toThrow('are required when SMTP_ENABLED=true');
    expect(resolveSmtpSettings({
      enabled: 'true',
      host: 'smtp.example.test',
      user: 'mailer',
      password: 'secret',
      fromEmail: 'noreply@example.test'
    })).toMatchObject({ enabled: true, host: 'smtp.example.test', user: 'mailer' });
  });
});
