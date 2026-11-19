import { test as base, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ensureAuthenticated, isLoginUrl } from '../utils/auth';
import { authFile, hasRefreshCookie, saveSession } from '../utils/session';
import { openFullWindow } from '../utils/window';

export const test = base.extend<{ sessionCheckpoint: void }>({
  storageState: async ({}, use) => {
    let text: string;
    try {
      text = await readFile(authFile, 'utf-8');
    } catch {
      throw new Error(
        'Saved session not found. Run npm run test:login first, then run the tests again.',
      );
    }
    await use(JSON.parse(text));
  },

  sessionCheckpoint: [async ({ page, context, baseURL }, use, testInfo) => {
    if (!baseURL) throw new Error('baseURL is missing from Playwright config.');

    // Headed runs pause before and after each test so you can watch the result.
    // Read-only checks finish in milliseconds otherwise. Set PAUSE_MS to change it.
    const headed = !testInfo.project.use.headless;
    const pauseMs = Number(process.env.PAUSE_MS ?? (headed ? 1500 : 0));
    const pause = async () => {
      if (pauseMs > 0 && !page.isClosed()) await page.waitForTimeout(pauseMs);
    };

    await openFullWindow(page);
    await ensureAuthenticated(page, context, baseURL);
    await pause();

    let rejected = false;
    const pending = new Set<object>();
    context.on('request', request => {
      if (new URL(request.url()).pathname === '/api/auth/refresh') pending.add(request);
    });
    context.on('response', response => {
      if (new URL(response.url()).pathname === '/api/auth/refresh') {
        pending.delete(response.request());
        if ([401, 403].includes(response.status())) rejected = true;
      }
    });

    try {
      await use();
    } finally {
      await pause();
      const onLogin = context.pages().some(p => isLoginUrl(p.url()));
      const canSave =
        !rejected &&
        !onLogin &&
        pending.size === 0 &&
        context.pages().length > 0 &&
        (await hasRefreshCookie(context));

      if (canSave) {
        try {
          await saveSession(context);
        } catch (error) {
          console.warn('Could not refresh saved session:', error);
        }
      } else {
        console.warn(
          'Session was rejected, unfinished, or on /login. Next test will soft re-login.',
        );
      }

      for (const open of context.pages()) await open.close();
    }
  }, { auto: true }],
});

test.afterEach(async ({ page }, testInfo) => {
  if (!page.isClosed()) {
    await testInfo.attach('page-at-end', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  }
});

export { expect };
