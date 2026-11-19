import { test, expect } from '../../fixtures/auth';
import { DcrPage } from '../../pages/DcrPage';
import data from '../../data/dcr.json';

test.describe('DCR Smoke Tests @smoke @regression', () => {
  test('DCR page loads with search, date range and export', async ({ page }) => {
    const dcr = new DcrPage(page);

    await dcr.open();

    await expect(dcr.searchInput).toBeEnabled();
    await expect(dcr.searchInput).toHaveAttribute('placeholder', 'Search');
    await expect(dcr.dateButton).toBeVisible();
    await expect(dcr.exportButton).toBeEnabled();
    await expect(dcr.filtersButton).toBeVisible();
  });

  test('DCR table shows the daily-call headers', async ({ page }) => {
    const dcr = new DcrPage(page);

    await dcr.open();
    await dcr.verifyHeaders(data.expectedHeaders);
  });
});
