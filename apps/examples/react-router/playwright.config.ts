import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '../e2e',
  timeout: 60_000,
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3203' },
  webServer: {
    command: 'node node_modules/@react-router/serve/bin.cjs ./build/server/index.js',
    env: { PORT: '3203' },
    url: 'http://localhost:3203',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
