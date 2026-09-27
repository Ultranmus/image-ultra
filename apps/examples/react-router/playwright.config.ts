import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '../e2e',
  timeout: 60_000,
  // In CI, failures also show as annotations on the GitHub run (readable without signing in).
  reporter: process.env['CI'] ? [['list'], ['github']] : [['list']],
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3203' },
  webServer: {
    command: 'node node_modules/@react-router/serve/bin.cjs ./build/server/index.js',
    env: { PORT: '3203' },
    url: 'http://localhost:3203',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
