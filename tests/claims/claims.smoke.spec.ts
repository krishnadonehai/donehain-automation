
import { test, expect } from '../../fixtures/auth';
import { ClaimsPage } from '../../pages/ClaimsPage';

test.describe('Claims Smoke Tests @smoke @regression', () => {
  test('Claims page loads successfully', async ({ page }) => {
    const claims = new ClaimsPage(page);

    await claims.open();
    await claims.verifyHeaders();

    await expect(claims.monthlyRegister).toBeVisible();
  });

  test('All claims status tabs are visible', async ({ page }) => {
    const claims = new ClaimsPage(page);
    await claims.open();

    const statuses = [
      'All',
      'Rejected',
      'Pending',
      'Approved',
      'System approved',
    ];

    for (const status of statuses) {
      await expect(
        page.getByRole('tab', {
          name: status,
          exact: true,
        })
      ).toBeVisible();
    }
  });
});
