
import { test, expect } from '../../fixtures/auth';
import { RcpaPage } from '../../pages/RcpaPage';

test.describe('RCPA Date Range @regression', () => {
  test('Date range dialog opens', async ({ page }) => {
    const rcpa = new RcpaPage(page);

    await rcpa.open();
    const dialog = await rcpa.openDateRange();

    await expect(dialog).toBeVisible();
  });
});
