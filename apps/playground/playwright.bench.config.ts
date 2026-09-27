import { defineConfig, devices } from '@playwright/test';

/**
 * `pnpm bench` (Phase 7.7a): the performance benchmark, not part of `pnpm e2e`.
 * Runs `/bench` twice — with WebGL2 and with WebGL turned off (the Canvas2D fallback).
 */
const shared = ['--js-flags=--expose-gc', '--enable-precise-memory-info'];

export default defineConfig({
  testDir: './bench',
  timeout: 15 * 60_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3100', viewport: { width: 1400, height: 900 } },
  projects: [
    {
      name: 'webgl2',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1400, height: 900 },
        deviceScaleFactor: 2, // a Retina Mac screen
        // Real GPU when possible (headless Chrome otherwise falls back to a software GPU).
        launchOptions: { args: [...shared, '--enable-gpu', '--ignore-gpu-blocklist'] },
      },
    },
    {
      name: 'canvas2d',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1400, height: 900 },
        deviceScaleFactor: 2, // a Retina Mac screen
        launchOptions: { args: [...shared, '--disable-webgl'] },
      },
    },
  ],
  webServer: {
    command: 'node node_modules/next/dist/bin/next start --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
