import { test, expect } from '../../fixtures/auth';
import { RcpaPage } from '../../pages/RcpaPage';
import data from '../../data/rcpa.json';
import { selectQuickRange } from '../../utils/date-range';

test.describe('RCPA Search Tests', () => {
  let rcpa: RcpaPage;

  test.beforeEach(async ({ page }) => {
    rcpa = new RcpaPage(page);
    await rcpa.open();
    await selectQuickRange(page, 'Last 30 days');
    await expect.poll(() => rcpa.rows.count(), { timeout: 30_000 }).toBeGreaterThan(0);
  });

  test('Search report by ID', async () => {
    const reportId = (await rcpa.rows.first().locator('td').nth(0).innerText()).replace('#', '').trim();
    expect(reportId).not.toBe('');

    await rcpa.search(reportId);

    await expect(rcpa.getReportRow(reportId)).toHaveCount(1, { timeout: 15_000 });
  });

  test('Search report by POI name', async () => {
    const poiText = (await rcpa.rows.first().locator('td').nth(2).innerText()).trim();
    const poiId = poiText.split(/\s+/)[0];
    const poiName = poiText.slice(poiId.length).trim();
    const query = poiName || poiId;
    expect(query).not.toBe('');

    await rcpa.search(query);

    await expect.poll(async () => {
      const texts = await rcpa.rows.locator('td:nth-child(3)').allTextContents();
      return texts.length > 0 && texts.every(text => text.includes(query));
    }, { timeout: 15_000 }).toBe(true);
  });

  test('Search report by MR name', async () => {
    const mrName = (await rcpa.rows.first().locator('td').nth(4).innerText()).trim();
    expect(mrName).not.toBe('');

    await rcpa.search(mrName);

    await expect.poll(async () => {
      const names = await rcpa.rows.locator('td:nth-child(5)').allTextContents();
      return names.length > 0 && names.every(name => name.includes(mrName));
    }, { timeout: 15_000 }).toBe(true);
  });

  test('Clear search', async () => {
    await rcpa.search(data.search.noMatch);
    await rcpa.clearSearch();

    await expect(rcpa.searchInput).toHaveValue('');
    await expect.poll(() => rcpa.rows.count(), { timeout: 15_000 }).toBeGreaterThan(0);
  });
});
