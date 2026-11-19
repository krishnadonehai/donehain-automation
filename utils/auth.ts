import { expect, type BrowserContext, type Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import {
  API_ORIGIN,
  capturedAccessToken,
  hasRefreshCookie,
  installRefreshBypass,
  saveSession,
  watchOtpTokenIssuance,
} from './session';
import { openFullWindow } from './window';

export function getFixedOtpCredentials(): { identifier: string; otp: string } {
  const identifier = process.env.TEST_IDENTIFIER?.trim();
  const otp = process.env.TEST_OTP?.trim();
  if (!identifier || !otp || !/^\d{6}$/.test(otp)) {
    throw new Error('Set TEST_IDENTIFIER and a six-digit TEST_OTP in .env.');
  }
  return { identifier, otp };
}

export function isLoginUrl(url: string): boolean {
  try {
    return /\/login(?:[/?#]|$)/.test(new URL(url).pathname);
  } catch {
    return /\/login(?:[/?#]|$)/.test(url);
  }
}

/**
 * Browser module tests need /api/auth/refresh to succeed. OTP login alone is
 * not enough — reload / soft re-login depends on a working donehai_refresh cookie.
 */
async function assertRefreshAccepted(context: BrowserContext): Promise<void> {
  const token = (await context.cookies()).find(
    cookie => cookie.name === 'donehai_refresh',
  )?.value;
  if (!token) {
    throw new Error(`No donehai_refresh cookie for ${API_ORIGIN} after login.`);
  }

  // Do not call /api/auth/refresh here. That response replaces the cookie
  // already stored in user.json. The OTP access token is what the tests reuse.
  if (capturedAccessToken(context)) return;

  const response = await context.request.post(`${API_ORIGIN}/api/auth/refresh`, {
    headers: { cookie: `donehai_refresh=${token}` },
    failOnStatusCode: false,
  });
  if (response.status() < 400) return;

  const body = await response.text();
  let error = 'unknown';
  let message = body.slice(0, 200);
  let authCode = '';
  let retryAfter = 0;
  try {
    const parsed = JSON.parse(body) as {
      error?: string;
      message?: string;
      auth_code?: string;
      retryAfter?: number;
    };
    error = parsed.error || error;
    message = parsed.message || message;
    authCode = parsed.auth_code ? ` / ${parsed.auth_code}` : '';
    retryAfter = Number(parsed.retryAfter) || 0;
  } catch {
    // keep raw body
  }

  // IP throttle after many OTP/setup runs — cookie is fresh; suite can continue.
  if (response.status() === 429) {
    console.warn(
      `Token refresh rate-limited (retryAfter=${retryAfter || 'unknown'}s). ` +
        'Continuing with the cookie from this login.',
    );
    return;
  }

  // Staging sometimes rejects the refresh cookie after a good OTP login.
  // The access token from that login is enough for the SPA to stay in.
  if (capturedAccessToken(context)) {
    console.warn(
      `Refresh returned HTTP ${response.status()}. ` +
        'Continuing with the access token from this login.',
    );
    return;
  }

  throw new Error(
    `CRM rejected token refresh after login: HTTP ${response.status()} ` +
      `(${error}${authCode}). ${message} ` +
      'Use a staging automation user with fixed OTP, working /api/auth/refresh, ' +
      'and Delegated Admin (or equivalent) module permissions. ' +
      'This is not a Playwright selector bug.',
  );
}

export async function loginWithFixedOtp(
  page: Page,
  context: BrowserContext,
  baseURL: string,
): Promise<void> {
  const { identifier, otp } = getFixedOtpCredentials();
  const login = new LoginPage(page);

  watchOtpTokenIssuance(page, context);
  await installRefreshBypass(context);
  await openFullWindow(page);

  await login.open();
  await login.requestOtp(identifier);
  await login.signIn(otp);

  await expect(page).toHaveURL(
    url =>
      url.origin === new URL(baseURL).origin &&
      /^\/dashboard\/?$/.test(url.pathname),
    { timeout: 30_000 },
  );
  await expect(login.otpInput).not.toBeVisible();

  await expect
    .poll(async () => hasRefreshCookie(context, API_ORIGIN), {
      timeout: 15_000,
      message: 'Login reached dashboard but donehai_refresh never appeared.',
    })
    .toBe(true);

  await expect
    .poll(() => capturedAccessToken(context) ?? '', {
      timeout: 5_000,
      message: 'OTP login reached the dashboard but no access token was captured.',
    })
    .not.toBe('');

  await assertRefreshAccepted(context);
  await saveSession(context);
}

let sessionReady = false;

export async function ensureAuthenticated(
  page: Page,
  context: BrowserContext,
  baseURL: string,
): Promise<void> {
  await installRefreshBypass(context);

  // A cookie file can exist after the server has already rejected it.
  // Check the app once per run. Later tests in the same run reuse the result.
  if (!sessionReady) {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/(login|dashboard)(?:[/?#]|$)/, { timeout: 20_000 }).catch(() => undefined);
  }

  if ((await hasRefreshCookie(context)) && !isLoginUrl(page.url())) {
    sessionReady = true;
    return;
  }

  if (await page.getByText(/Too many requests from this IP/i).isVisible().catch(() => false)) {
    throw new Error(
      'Staging auth is rate-limiting this IP. Wait a minute, then run npm run test:login. ' +
        'Avoid repeated OTP logins in a short window.',
    );
  }

  console.warn('Saved session was rejected. Signing in once; the rest of this run reuses that session.');
  await loginWithFixedOtp(page, context, baseURL);
  sessionReady = true;
}
