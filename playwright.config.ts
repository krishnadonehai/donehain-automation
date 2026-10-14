import 'dotenv/config';
import { defineConfig } from '@playwright/test';

const baseURL = process.env.BASE_URL?.trim();
if (!baseURL) throw new Error('Create .env from .env.example and set BASE_URL.');
if (new URL(baseURL).origin !== 'https://app.st.donehai.com') {
  throw new Error('This fixed-OTP project is configured for https://app.st.donehai.com only.');
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
    headless: process.env.HEADLESS === 'true',
  viewport: null,
launchOptions: {
  args: ['--start-maximized'],
  slowMo: Number(process.env.SLOW_MO ?? 700),
},
    acceptDownloads: true,
    screenshot: 'off', // A screenshot is attached by hooks before auth checkpointing.
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
