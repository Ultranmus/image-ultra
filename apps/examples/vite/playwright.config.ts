import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '../e2e',
  timeout: 60_000,
  // In CI, failures also show as annotations on the GitHub run (readable without signing in).
  reporter: process.env['CI'] ? [['list'], ['github']] : [['list']],
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3202' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --port 3202 --strictPort',
    url: 'http://localhost:3202',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
