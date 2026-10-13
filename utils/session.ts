import type { BrowserContext } from '@playwright/test';
import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

export const authFile = path.resolve('playwright/.auth/user.json');

export async function saveSession(context: BrowserContext): Promise<void> {
  await mkdir(path.dirname(authFile), { recursive: true });
  const temporary = `${authFile}.tmp`;
  await context.storageState({ path: temporary, indexedDB: true });
  await rename(temporary, authFile);
}
