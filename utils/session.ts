import type { BrowserContext, Page } from '@playwright/test';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const authFile = path.resolve('playwright/.auth/user.json');
export const accessFile = path.resolve('playwright/.auth/access.json');
export const API_ORIGIN = 'https://api.st.donehai.com';

type AccessBag = {
  accessToken: string;
  refreshCookie?: string;
};

type ContextBag = BrowserContext & {
  _donehaiAccess?: AccessBag;
  _refreshBypassInstalled?: boolean;
};

export async function hasRefreshCookie(
  context: BrowserContext,
  apiOrigin = API_ORIGIN,
): Promise<boolean> {
  const scoped = await context.cookies(apiOrigin);
  if (scoped.some(cookie => cookie.name === 'donehai_refresh')) return true;
  return (await context.cookies()).some(cookie => cookie.name === 'donehai_refresh');
}

export async function loadAccessBag(): Promise<AccessBag | null> {
  try {
    const parsed = JSON.parse(await readFile(accessFile, 'utf-8')) as AccessBag;
    return parsed.accessToken ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveAccessBag(bag: AccessBag): Promise<void> {
  if (!bag.accessToken) return;
  await mkdir(path.dirname(accessFile), { recursive: true });
  const temporary = `${accessFile}.tmp`;
  await writeFile(temporary, JSON.stringify(bag), 'utf-8');
  await rename(temporary, accessFile);
}

export function capturedAccessToken(context: BrowserContext): string | undefined {
  return (context as ContextBag)._donehaiAccess?.accessToken;
}

/** Capture the access token returned by a successful OTP verify. */
export function watchOtpTokenIssuance(page: Page, context: BrowserContext): void {
  const bag = context as ContextBag;
  page.on('response', async response => {
    if (!/\/api\/otp-auth\/verify-user-otp(?:\?|$)/.test(response.url())) return;
    try {
      const headers = await response.allHeaders();
      const refresh = /donehai_refresh=([^;]+)/i.exec(headers['set-cookie'] || '')?.[1];
      const json = await response.json() as {
        accessToken?: string;
        data?: { token?: string };
      };
      const accessToken = json.accessToken || json.data?.token;
      if (!accessToken) return;
      bag._donehaiAccess = {
        accessToken,
        refreshCookie: refresh || bag._donehaiAccess?.refreshCookie,
      };
      await saveAccessBag(bag._donehaiAccess);
    } catch {
      // Login still checks the cookie jar if this body cannot be read.
    }
  });
}

async function waitForAccessToken(bag: ContextBag, timeoutMs: number): Promise<string | undefined> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (bag._donehaiAccess?.accessToken) return bag._donehaiAccess.accessToken;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return bag._donehaiAccess?.accessToken;
}

/**
 * The SPA calls /api/auth/refresh on every new page. That call issues a new
 * refresh cookie and invalidates the one already stored in user.json.
 * Answer from the access token captured at OTP login and leave the saved
 * cookie unchanged.
 */
export async function installRefreshBypass(context: BrowserContext): Promise<void> {
  const bag = context as ContextBag;
  if (!bag._donehaiAccess) {
    bag._donehaiAccess = (await loadAccessBag()) ?? undefined;
  }
  if (bag._refreshBypassInstalled) return;
  bag._refreshBypassInstalled = true;

  await context.route('**/api/auth/refresh', async route => {
    const accessToken = await waitForAccessToken(bag, bag._donehaiAccess?.accessToken ? 0 : 3000);
    if (!accessToken) {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        accessToken,
        data: {
          accessToken,
          token: accessToken,
        },
      }),
    });
  });
}

/**
 * Persist cookies + app localStorage. Must run while a DoneHai page is open.
 */
export async function saveSession(context: BrowserContext): Promise<void> {
  const page = context.pages().find(p => /^https?:/.test(p.url()));
  if (!page) {
    throw new Error('saveSession needs an open DoneHai page.');
  }

  if (!(await hasRefreshCookie(context))) {
    throw new Error(
      `donehai_refresh cookie not found for ${API_ORIGIN}. ` +
        'Refusing to save a session that will expire mid-suite.',
    );
  }

  const bag = context as ContextBag;
  const cookies = await context.cookies();
  // Save the cookie from this browser. The server rejects the previous one after a new login.
  const liveRefresh = cookies.find(cookie => cookie.name === 'donehai_refresh')?.value;

  if (bag._donehaiAccess?.accessToken) {
    bag._donehaiAccess = {
      ...bag._donehaiAccess,
      refreshCookie: liveRefresh || bag._donehaiAccess.refreshCookie,
    };
    await saveAccessBag(bag._donehaiAccess);
  }

  const origin = new URL(page.url()).origin;
  const localStorage = await page.evaluate(() =>
    Object.entries(window.localStorage).map(([name, value]) => ({ name, value })),
  );

  const state = {
    cookies,
    origins: [{ origin, localStorage }],
  };

  await mkdir(path.dirname(authFile), { recursive: true });
  const temporary = `${authFile}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2), 'utf-8');
  await rename(temporary, authFile);
}
