import { test, expect } from '../../fixtures/auth';
import { RcpaPage } from '../../pages/RcpaPage';
import data from '../../data/rcpa.json';
import { selectQuickRange } from '../../utils/date-range';
import { daysBefore, displayDate, todayInIndia } from '../../utils/dates';

test.describe('RCPA Smoke Tests @smoke @regression', () => {
  test('Field Voices page loads with search and date control', async ({ page }) => {
    const rcpa = new RcpaPage(page);

    await rcpa.open();

    await expect(rcpa.searchInput).toBeEnabled();
    await expect(rcpa.dateButton).toBeVisible();
    await expect(rcpa.filtersButton).toBeVisible();
  });

  test('Rolling date range shows table headers or empty state', async ({ page }) => {
    const rcpa = new RcpaPage(page);
    await rcpa.open();

    const to = todayInIndia();
    const from = daysBefore(to, 29);
    await selectQuickRange(page, 'Last 30 days');

    await expect(rcpa.dateButton).toHaveText(
      new RegExp(`^${displayDate(from)}\\s*[–—-]\\s*${displayDate(to)}$`),
    );

    await expect
      .poll(async () => {
        if (await rcpa.table.isVisible().catch(() => false)) return 'table';
        if (await rcpa.emptyState.isVisible().catch(() => false)) return 'empty';
        return 'loading';
      }, { timeout: 30_000 })
      .not.toBe('loading');

    if (await rcpa.table.isVisible()) {
      await rcpa.verifyHeaders(data.expectedHeaders);
    } else {
      await expect(rcpa.emptyState).toBeVisible();
    }
  });
});
