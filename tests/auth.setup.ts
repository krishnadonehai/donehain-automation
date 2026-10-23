import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { saveSession } from '../utils/session';

test.use({ storageState: { cookies: [], origins: [] } });

test('Login once with staging email and fixed OTP', async ({ page, context, baseURL }, testInfo) => {
  const identifier = process.env.TEST_IDENTIFIER?.trim();
  const otp = process.env.TEST_OTP?.trim();
  if (!identifier || !otp || !/^\d{6}$/.test(otp)) {
    throw new Error('Set TEST_IDENTIFIER and a six-digit TEST_OTP in .env.');
  }
  const login = new LoginPage(page);
  try {
    await test.step('Open login and request OTP', async () => {
      await login.open();
      await login.requestOtp(identifier);
    });
    await test.step('Enter OTP and verify dashboard', async () => {
      await login.signIn(otp);
      await expect(page).toHaveURL(url =>
        url.origin === new URL(baseURL!).origin && /^\/dashboard\/?$/.test(url.pathname),
      { timeout: 30_000 });
      await expect(login.otpInput).not.toBeVisible();
    });
    await test.step('Verify protected page before saving authentication', async () => {
      await page.goto('/attendance');
      await expect(page.getByPlaceholder('Search name, department, or role...'))
        .toBeVisible({ timeout: 30_000 });
    });
    await testInfo.attach('login-success', {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    });
    await saveSession(context);
    await page.close();
    console.log('Login succeeded; fresh authentication saved.');
  } catch (error) {
    if (!page.isClosed()) await testInfo.attach('login-failure', {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    });
    throw error;
  }
});
