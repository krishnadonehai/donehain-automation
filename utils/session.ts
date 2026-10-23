import type { BrowserContext } from '@playwright/test';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const authFile = path.resolve('playwright/.auth/user.json');

/**
 * context.storageState() hangs intermittently on DoneHai (it visits every
 * origin the context has seen, including third-party widgets), so the state
 * is built from cookies plus the open app page's localStorage.
 */
export async function saveSession(context: BrowserContext): Promise<void> {
  const page = context.pages().find(p => /^https?:/.test(p.url()));
  if (!page) throw new Error('saveSession needs an open DoneHai page.');
  const origin = new URL(page.url()).origin;
  const localStorage = await page.evaluate(() =>
    Object.entries(window.localStorage).map(([name, value]) => ({ name, value }))
  );
  const state = {
    cookies: await context.cookies(),
    origins: [{ origin, localStorage }],
  };
  await mkdir(path.dirname(authFile), { recursive: true });
  const temporary = `${authFile}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2), 'utf-8');
  await rename(temporary, authFile);
}
