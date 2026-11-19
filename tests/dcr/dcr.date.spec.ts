import { test, expect } from '../../fixtures/auth';
import { DcrPage } from '../../pages/DcrPage';
import data from '../../data/dcr.json';
import { daysBefore, displayDate, todayInIndia } from '../../utils/dates';

test.describe('DCR Date Tests @regression', () => {
  test('Date range opens and closes', async ({ page }) => {
    const dcr = new DcrPage(page);

    await dcr.open();
    const dialog = await dcr.openDateRange();

    await expect(dialog.getByText('Quick Select', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Last 30 days', exact: true })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(dcr.dateButton).toHaveAttribute('aria-expanded', 'false');
  });

  test('Last 30 days can be selected', async ({ page }) => {
    const dcr = new DcrPage(page);
    const to = todayInIndia();
    const from = daysBefore(to, 29);

    await dcr.open();
    await dcr.selectQuickRange('Last 30 days');

    await expect(dcr.dateButton).toHaveText(
      new RegExp(`^${displayDate(from)}\\s*[–—-]\\s*${displayDate(to)}$`),
    );
  });

  test('01-Sep-2026 to 31-Oct-2026 can be selected', async ({ page }) => {
    const dcr = new DcrPage(page);

    await dcr.open();
    await dcr.selectDateRange(data.range.from, data.range.to);

    await expect(dcr.dateButton).toHaveText(/01-Sep-2026\s*[–—-]\s*31-Oct-2026/);
  });
});
