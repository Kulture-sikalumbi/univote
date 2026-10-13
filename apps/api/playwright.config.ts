import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_WEB_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
});
