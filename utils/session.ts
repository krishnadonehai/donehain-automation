import type { BrowserContext } from '@playwright/test';
import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

export const authFile = path.resolve('playwright/.auth/user.json');

export async function saveSession(context: BrowserContext): Promise<void> {
  await mkdir(path.dirname(authFile), { recursive: true });
  const temporary = `${authFile}.tmp`;
  // Must run while a page is still open: with no pages, storageState() hangs on DoneHai.
  await context.storageState({ path: temporary });
  await rename(temporary, authFile);
}
