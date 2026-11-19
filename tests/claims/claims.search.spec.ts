
import { test, expect } from '../../fixtures/auth';
import { ClaimsPage } from '../../pages/ClaimsPage';
import claimsData from "../../data/claims.json";

test.describe('Claims Search Tests', () => {
  let claims: ClaimsPage;

  test.beforeEach(async ({ page }) => {
    claims = new ClaimsPage(page);
    await claims.open();
    await claims.selectStatus('All');
  });

  test('Search by employee name', async () => {
    const data = claimsData.search.byName;

    await claims.search(data.query);

    await expect.poll(async () => {
      const rows = await claims.rows.count();
      if (!rows) return false;

      const names = await claims.rows
        .locator('td:nth-child(3)')
        .allTextContents();

      return names.every(name =>
        name.trim().toLowerCase() ===
        data.expectedName.toLowerCase()
      );
    }).toBe(true);
  });

  test('Search by employee ID', async () => {
    const data = claimsData.search.byEmployeeId;

    await claims.search(data.query);

    await expect.poll(async () => {
      const rows = await claims.rows.count();
      if (!rows) return false;

      const ids = await claims.rows
        .locator('td:nth-child(4)')
        .allTextContents();

      return ids.every(id =>
        id.trim() === data.expectedEmployeeId
      );
    }).toBe(true);
  });

  test('Search by claim ID', async () => {
    const claimId = (await claims.rows.first().locator('td').first().innerText()).trim();
    expect(claimId).not.toBe('');

    await claims.search(claimId);

    await expect(await claims.getClaimRow(claimId)).toHaveCount(1);
  });

  test('Unknown search shows no claims', async () => {
    await claims.search(claimsData.search.noMatch.query);

    await expect(claims.rows).toHaveCount(0, { timeout: 15_000 });
  });

  test('Clearing search restores the claims', async () => {
    await expect.poll(() => claims.rows.count(), { timeout: 15_000 }).toBeGreaterThan(0);
    const before = await claims.rows.count();

    await claims.search(claimsData.search.noMatch.query);
    await expect(claims.rows).toHaveCount(0, { timeout: 15_000 });

    await claims.clearSearch();
    await expect(claims.rows).toHaveCount(before, { timeout: 15_000 });
  });
});
