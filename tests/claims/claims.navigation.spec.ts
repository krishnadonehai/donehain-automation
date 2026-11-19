
import { test, expect } from '../../fixtures/auth';
import { ClaimsPage } from '../../pages/ClaimsPage';

test.describe('Claims Navigation', () => {
  test('Navigate to Monthly Register', async ({ page }) => {
    const claims = new ClaimsPage(page);

    await claims.open();
    await claims.openMonthlyRegister();

    await expect(page).toHaveURL(/\/claims\/monthly\/?$/);
  });

  test('Open claim details', async ({ page }) => {
    const claims = new ClaimsPage(page);

    await claims.open();
    const row = claims.rows.first();
    const claimId = (await row.locator('td').nth(0).innerText()).trim();
    const name = (await row.locator('td').nth(2).innerText()).trim();

    await claims.viewClaim(claimId);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(name)).toBeVisible();
    await expect(dialog.getByText(/Employee ID/)).toBeVisible();
  });
});
