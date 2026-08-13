import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup-env.ts'],
    exclude: ['tests/integration/**', 'node_modules/**', 'dist/**'],
    clearMocks: true,
    restoreMocks: true
  }
});
