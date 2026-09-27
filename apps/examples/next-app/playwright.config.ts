import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '../e2e',
  timeout: 60_000,
  // In CI, failures also show as annotations on the GitHub run (readable without signing in).
  reporter: process.env['CI'] ? [['list'], ['github']] : [['list']],
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3201' },
  webServer: {
    command: 'node node_modules/next/dist/bin/next start --port 3201',
    url: 'http://localhost:3201',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
