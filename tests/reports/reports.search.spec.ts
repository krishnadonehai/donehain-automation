import { test, expect } from '../../fixtures/auth';
import { ReportsPage } from '../../pages/ReportsPage';

test.describe('Reports Search @regression', () => {
  test('Unknown employee search stays on the report', async ({ page }) => {
    const reports = new ReportsPage(page);
    const query = 'zz_report_invalid_748159';

    await reports.open();
    await reports.search(query);

    await expect(reports.searchInput).toHaveValue(query);
    await expect(page).toHaveURL(/\/reports\/performance/);
    await expect(reports.heading).toBeVisible();
  });
});
