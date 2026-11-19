import { test, expect } from '../../fixtures/auth';
import { DcrPage, type DcrRecord } from '../../pages/DcrPage';
import data from '../../data/dcr.json';

test.describe('DCR Data Tests @regression', () => {
  test.beforeEach(async ({ page }) => {
    const dcr = new DcrPage(page);
    await dcr.open();
    await dcr.selectDateRange(data.range.from, data.range.to);
  });

  for (const row of data.rows) {
    test(`${row.date} ${row.employee} is ${row.status}`, async ({ page }) => {
      const dcr = new DcrPage(page);
      await dcr.search(data.search.employeeName);
      await expect.poll(async () => {
        const rows = await dcr.readRows();
        return rows.length > 0 && rows.every(item => item.employee.includes(data.search.employeeName));
      }, { timeout: 30_000 }).toBe(true);
      await dcr.expectRecord(row as DcrRecord);
    });
  }

  test('A day row opens its details', async ({ page }) => {
    const dcr = new DcrPage(page);
    const row = data.rows.find(item => item.date === '28-Oct-2026') as DcrRecord;

    await dcr.search(data.search.employeeName);
    await expect.poll(async () => {
      const rows = await dcr.readRows();
      return rows.some(item => item.date === row.date && item.employee === row.employee);
    }, { timeout: 30_000 }).toBe(true);

    await dcr.row(row.date, row.employee).dispatchEvent('click');

    const details = page.getByRole('dialog').last();
    await expect(details).toBeVisible();
    await expect(details.getByRole('heading', { name: row.employee, exact: true })).toBeVisible();
    await expect(details).toContainText(`Planned ${row.planned} · Actual ${row.actual}`);
    await expect(details).toContainText(row.visitType);
    await expect(details).toContainText(row.status);
  });
});
