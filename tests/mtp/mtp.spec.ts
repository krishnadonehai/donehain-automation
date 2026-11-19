import { test, expect } from '../../fixtures/auth';
import { MtpPage } from '../../pages/MtpPage';

test.describe('MTP @smoke @regression', () => {
  test('MTP shows the year, months, and an empty MR state', async ({ page }) => {
    const mtp = new MtpPage(page);
    await mtp.open();

    await expect(mtp.financialYear).toBeVisible();
    await expect(mtp.month).toBeVisible();
    await expect(mtp.month.locator('option').first()).toHaveText('Apr 2026');
    await expect(mtp.month.locator('option').last()).toHaveText('Mar 2027');
  });

  test('Choosing a month keeps the empty state until an MR is selected', async ({ page }) => {
    const mtp = new MtpPage(page);
    await mtp.open();
    await mtp.selectMonth('Apr 2026');
    await expect(mtp.month).toContainText('Apr 2026');
    await expect(mtp.emptyState).toBeVisible();
  });
});
