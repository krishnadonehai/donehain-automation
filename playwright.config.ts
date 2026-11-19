import 'dotenv/config';
import { defineConfig } from '@playwright/test';

const baseURL = process.env.BASE_URL?.trim();
if (!baseURL) throw new Error('Create .env from .env.example and set BASE_URL.');
if (new URL(baseURL).origin !== 'https://app.st.donehai.com') {
  throw new Error('This fixed-OTP project is configured for https://app.st.donehai.com only.');
}

// --headed wins over HEADLESS=true so a watched run uses the real window.
const headless = process.env.HEADLESS === 'true' && !process.argv.includes('--headed');
const slowMo = Number(process.env.SLOW_MO ?? (headless ? 0 : 1000));

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  maxFailures: 0,
  forbidOnly: !!process.env.CI,

 
  reporter: [
  ['list'],
  ['html', { open: 'never' }],
  ['json', { outputFile: 'test-results/results.json' }],
  ['junit', { outputFile: 'test-results/junit.xml' }],
],
  use: {
    baseURL,
    browserName: 'chromium',
    headless,
    // A fixed viewport keeps the window at that size. Headed runs use the maximized window.
    viewport: headless ? { width: 1920, height: 1080 } : null,
    launchOptions: {
      args: headless ? [] : ['--start-maximized'],
      slowMo,
    },
    acceptDownloads: true,
    screenshot: 'only-on-failure',
    video: 'off',
    trace: 'retain-on-failure', 
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
  },
],
});
