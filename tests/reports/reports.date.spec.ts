import { test, expect } from '../../fixtures/auth';
import { ReportsPage } from '../../pages/ReportsPage';
import { openDateRange, selectQuickRange } from '../../utils/date-range';
import { daysBefore, displayDate, todayInIndia } from '../../utils/dates';

test.describe('Reports Date @regression', () => {
  test('Date range opens and closes', async ({ page }) => {
    const reports = new ReportsPage(page);
    await reports.open();

    const dialog = await openDateRange(page);
    await expect(dialog.getByText('Quick Select', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(reports.dateButton).toHaveAttribute('aria-expanded', 'false');
  });

  test('Last 30 days can be selected', async ({ page }) => {
    const reports = new ReportsPage(page);
    const to = todayInIndia();
    const from = daysBefore(to, 29);

    await reports.open();
    await selectQuickRange(page, 'Last 30 days');

    await expect(reports.dateButton).toHaveText(
      new RegExp(`^${displayDate(from)}\\s*[–—-]\\s*${displayDate(to)}$`),
    );
  });
});
