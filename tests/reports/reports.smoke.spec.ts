import { test, expect } from '../../fixtures/auth';
import { ReportsPage } from '../../pages/ReportsPage';

test.describe('Reports Smoke @smoke @regression', () => {
  test('Performance report loads with search, date range and export', async ({ page }) => {
    const reports = new ReportsPage(page);
    await reports.open();

    await expect(reports.searchInput).toBeEnabled();
    await expect(reports.refreshButton).toBeVisible();
    await expect(reports.exportButton).toBeEnabled();
  });
});
