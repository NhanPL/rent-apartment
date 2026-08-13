import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup-env.ts'],
    include: ['tests/integration/**/*.integration.spec.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
