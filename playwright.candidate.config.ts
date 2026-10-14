import 'dotenv/config';
import { defineConfig } from '@playwright/test';

const baseURL = process.env.BASE_URL?.trim();
if (!baseURL) throw new Error('Set BASE_URL for candidate Playwright runs.');

const origin = new URL(baseURL).origin;
const allowed =
  origin === 'https://app.st.donehai.com' ||
  /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
  /^http:\/\/localhost:\d+$/.test(origin);

if (!allowed) {
  throw new Error(
    `Candidate Playwright BASE_URL origin not allowed: ${origin}. Use localhost/127.0.0.1 candidate ports or approved ST host.`,
  );
}

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  maxFailures: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    browserName: 'chromium',
    headless: process.env.HEADLESS !== 'false',
    viewport: null,
    launchOptions: {
      args: ['--start-maximized'],
      slowMo: Number(process.env.SLOW_MO ?? 0),
    },
    acceptDownloads: true,
    screenshot: 'off',
    video: { mode: 'on', size: { width: 1920, height: 1080 } },
    trace: 'on',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      testMatch: '**/*.spec.ts',
      use: {
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
});
