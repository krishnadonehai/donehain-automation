import { type Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth';
import { RcpaPage } from '../../pages/RcpaPage';
import { selectQuickRange } from '../../utils/date-range';

async function openRecentReports(page: Page, rcpa: RcpaPage) {
  await rcpa.open();
  await selectQuickRange(page, 'Last 30 days');
}

test.describe('RCPA Data Validation', () => {
  test('Visible reports show id, date, POI, MR and status', async ({ page }) => {
    const rcpa = new RcpaPage(page);
    await openRecentReports(page, rcpa);

    await expect.poll(async () => {
      if (await rcpa.rows.count()) return 'rows';
      if (await rcpa.emptyState.isVisible().catch(() => false)) return 'empty';
      return 'loading';
    }, { timeout: 30_000 }).not.toBe('loading');

    if (await rcpa.emptyState.isVisible().catch(() => false)) {
      await expect(rcpa.emptyState).toBeVisible();
      return;
    }

    const count = Math.min(await rcpa.rows.count(), 5);
    expect(count).toBeGreaterThan(0);

    for (let index = 0; index < count; index++) {
      const cells = rcpa.rows.nth(index).locator('td');
      await expect(cells.nth(0)).toHaveText(/^#\d+$/);
      await expect(cells.nth(1)).not.toHaveText('');
      await expect(cells.nth(2)).not.toHaveText('');
      await expect(cells.nth(4)).not.toHaveText('');
      await expect(cells.nth(5)).not.toHaveText('');
    }
  });
});
