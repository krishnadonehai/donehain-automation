import { test, expect } from '../../fixtures/auth';
import { StpPage } from '../../pages/StpPage';

test.describe('STP @smoke @regression', () => {
  test('STP shows the year, export, and an empty MR state', async ({ page }) => {
    const stp = new StpPage(page);
    await stp.open();

    await expect(stp.exportButton).toBeVisible();
    await expect(stp.importButton).toBeVisible();
    await expect(stp.financialYear).toBeVisible();
    await expect(stp.financialYear.locator('option')).toHaveText([
      '2025\u201326',
      '2026\u201327',
      '2027\u201328',
    ]);
  });

  test('Choosing a year keeps the empty state until an MR is selected', async ({ page }) => {
    const stp = new StpPage(page);
    await stp.open();
    await stp.selectYear('2027\u201328');
    await expect(stp.financialYear).toContainText('2027\u201328');
    await expect(stp.emptyState).toBeVisible();
  });
});
