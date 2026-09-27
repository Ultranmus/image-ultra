import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // In CI, failures also show as annotations on the GitHub run (readable without signing in).
  reporter: process.env['CI'] ? [['list'], ['github']] : [['list']],
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } },
    },
  ],
  webServer: {
    // Start Next directly: pnpm doesn't forward the stop signal, which stalls teardown.
    command: 'node node_modules/next/dist/bin/next start --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
