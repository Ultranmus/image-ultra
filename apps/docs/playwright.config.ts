import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3300' },
  // The site follows the OS: check both.
  projects: [
    { name: 'light', use: { colorScheme: 'light' } },
    { name: 'dark', use: { colorScheme: 'dark' } },
  ],
  webServer: {
    // The static export in `out/` (run `pnpm build` first).
    command: 'node scripts/serve.ts',
    url: 'http://localhost:3300',
    reuseExistingServer: !process.env['CI'],
    timeout: 30_000,
  },
});
