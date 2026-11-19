import { expect, type Page } from '@playwright/test';

/** Shared DoneHai range button: "01-Nov-2026 – 17-Nov-2026" plus Quick Select. */
export function dateRangeButton(page: Page) {
  return page.locator('button[aria-haspopup="dialog"]').filter({
    hasText: /\d{2}-[A-Za-z]{3}-\d{4}/,
  });
}

export async function openDateRange(page: Page) {
  const button = dateRangeButton(page);
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const dialogId = await button.getAttribute('aria-controls');
  if (!dialogId) throw new Error('Date button has no aria-controls dialog reference.');
  const dialog = page.locator(`[id=${JSON.stringify(dialogId)}]`);
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function selectQuickRange(page: Page, label: string) {
  const dialog = await openDateRange(page);
  await dialog.getByRole('button', { name: label, exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}
