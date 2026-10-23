import { test as base, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { authFile, saveSession } from '../utils/session';

export const test = base.extend<{ sessionCheckpoint: void }>({
  storageState: async ({}, use) => {
    let text: string;
    try { text = await readFile(authFile, 'utf-8'); }
    catch { throw new Error('Saved session not found. Run npm run test:login first, or npm run test:attendance.'); }
    await use(JSON.parse(text));
  },
  sessionCheckpoint: [async ({ context }, use) => {
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
      const redirected = context.pages().some(page => /\/login(?:[/?#]|$)/.test(page.url()));
      if (!rejected && !redirected && pending.size === 0 && context.pages().length > 0) {
        await saveSession(context);
      } else {
        console.warn('Session was rejected or refresh was unfinished. Run npm run test:login before reusing it.');
      }
      for (const page of context.pages()) await page.close();
    }
  }, { auto: true }],
});

// Capture while the page is alive; the checkpoint closes it after test hooks.
test.afterEach(async ({ page }, testInfo) => {
  if (!page.isClosed()) {
    await testInfo.attach('page-at-end', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  }
});

export { expect };
