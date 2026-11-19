import { test, expect } from '../../fixtures/auth';
import { DcrPage } from '../../pages/DcrPage';
import data from '../../data/dcr.json';

test.describe('DCR Search Tests @regression', () => {
  let dcr: DcrPage;

  test.beforeEach(async ({ page }) => {
    dcr = new DcrPage(page);
    await dcr.open();
    await dcr.selectDateRange(data.range.from, data.range.to);
  });

  test('Search by employee name', async () => {
    await dcr.search(data.search.employeeName);

    await expect.poll(async () => {
      const rows = await dcr.readRows();
      return rows.length > 0 && rows.every(row => row.employee.includes(data.search.employeeName));
    }, { timeout: 30_000 }).toBe(true);
  });

  test('Search by employee code', async () => {
    await dcr.search(data.search.employeeCode);

    await expect.poll(async () => {
      const rows = await dcr.readRows();
      return rows.length > 0 && rows.every(row => row.employee.includes(`(${data.search.employeeCode})`));
    }, { timeout: 30_000 }).toBe(true);
  });

  test('Clear search restores the range', async () => {
    await dcr.search(data.search.employeeCode);
    await expect.poll(async () => (await dcr.readRows()).length).toBeGreaterThan(0);

    await dcr.clearSearch();

    await expect(dcr.searchInput).toHaveValue('');
    await expect.poll(async () => (await dcr.readRows()).length).toBeGreaterThan(0);
  });

  test('Unknown search shows no activity', async () => {
    await dcr.search(data.search.noMatch);

    await expect(dcr.emptyState).toBeVisible({ timeout: 30_000 });
    await expect(dcr.dataRows).toHaveCount(0);
  });
});
