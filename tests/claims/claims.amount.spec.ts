import { test, expect } from '../../fixtures/auth';
import { ClaimsPage } from '../../pages/ClaimsPage';

function money(text: string): number | null {
  const match = text.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

test.describe('Claims Amount Validation', () => {
  test('Visible claim totals match travel and daily allowance', async ({ page }) => {
    const claims = new ClaimsPage(page);

    await claims.open();
    await claims.selectStatus('All');
    await expect.poll(() => claims.rows.count(), { timeout: 15_000 }).toBeGreaterThan(0);

    const count = await claims.rows.count();
    let checked = 0;

    for (let index = 0; index < count; index++) {
      const cells = claims.rows.nth(index).locator('td');
      const travel = money(await cells.nth(7).innerText());
      const daily = money(await cells.nth(8).innerText());
      const total = money(await cells.nth(9).innerText());
      const claimId = (await cells.nth(0).innerText()).trim();

      expect(total, `${claimId} total`).not.toBeNull();
      if (travel !== null && daily !== null) {
        expect(total, `${claimId} total`).toBeCloseTo(travel + daily, 2);
        checked++;
      } else if (travel !== null) {
        expect(total, `${claimId} total`).toBeCloseTo(travel, 2);
        checked++;
      }
    }

    expect(checked).toBeGreaterThan(0);
  });
});
