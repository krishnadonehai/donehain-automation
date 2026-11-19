import { test, expect } from '../../fixtures/auth';
import { ClaimsPage } from '../../pages/ClaimsPage';
import { dateRangeButton, openDateRange, selectQuickRange } from '../../utils/date-range';
import { daysBefore, displayDate, todayInIndia } from '../../utils/dates';

test.describe('Claims Date @regression', () => {
  test('Date range opens and closes', async ({ page }) => {
    const claims = new ClaimsPage(page);
    await claims.open();

    const dialog = await openDateRange(page);
    await expect(dialog.getByText('Quick Select', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(dateRangeButton(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('Last 30 days can be selected', async ({ page }) => {
    const claims = new ClaimsPage(page);
    const to = todayInIndia();
    const from = daysBefore(to, 29);

    await claims.open();
    await selectQuickRange(page, 'Last 30 days');

    await expect(dateRangeButton(page)).toHaveText(
      new RegExp(`^${displayDate(from)}\\s*[–—-]\\s*${displayDate(to)}$`),
    );
  });
});
