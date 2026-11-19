import { test, expect } from '@playwright/test';
import { loginWithFixedOtp } from '../utils/auth';
import { openFullWindow } from '../utils/window';

test.use({
  storageState: {
    cookies: [],
    origins: [],
  },
});

test('Login once with staging email and fixed OTP', async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  if (!baseURL) throw new Error('baseURL is missing from Playwright config.');
  await openFullWindow(page);

  try {
    await test.step('OTP login and save the issued session', async () => {
      await loginWithFixedOtp(page, context, baseURL);
    });

    await expect(page).not.toHaveURL(/\/login/);

    await testInfo.attach('login-success', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    console.log('Login succeeded; fresh authentication saved.');
  } catch (error) {
    if (!page.isClosed()) {
      await testInfo.attach('login-failure', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    }
    throw error;
  }
});
