import { defineConfig, devices } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:4000';
const webUrl = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : 'list',
  use: {
    baseURL: webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'npm run start --prefix ../backend',
      url: `${apiUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { ...process.env, PORT: '4000' }
    },
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 4173',
      url: webUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    }
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});
