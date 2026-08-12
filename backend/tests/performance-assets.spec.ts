import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('performance test assets', () => {
  it('keeps smoke and load profiles guarded by latency and failure thresholds', () => {
    for (const profile of ['load-tests/api-smoke.js', 'load-tests/manager-read-load.js']) {
      const source = read(profile);
      expect(source).toContain("http_req_failed: ['rate<0.01']");
      expect(source).toContain("checks: ['rate>0.99']");
      expect(source).toContain('login()');
    }
  });

  it('runs load profiles against an isolated seeded database and retains summaries', () => {
    const workflow = read('.github/workflows/performance.yml');
    expect(workflow).toContain('POSTGRES_DB: rentmate_load');
    expect(workflow).toContain('npm run db:seed:e2e');
    expect(workflow).toContain('--summary-export=load-smoke-summary.json');
    expect(workflow).toContain('--summary-export=load-read-summary.json');
    expect(workflow).toContain('performance-test-results');
  });
});
