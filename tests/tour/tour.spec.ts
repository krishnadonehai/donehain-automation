import { test, expect } from '../../fixtures/auth';
import { TourPage, type TourRecord, type TourStatus } from '../../pages/TourPage';
import data from '../../data/tour.json';
import { daysBefore, todayInIndia } from '../../utils/dates';
import { readFile, stat } from 'node:fs/promises';

const STATUSES: TourStatus[] = ['All', 'Pending', 'Approved', 'Rejected'];

// Staging records change, so assertions compare against the All-tab baseline
// for a rolling range instead of a hard-coded fixture.
const to = todayInIndia();
const from = daysBefore(to, data.rangeDays - 1);

function isoFromTourDate(date: string): string {
  const [day, month, year] = date.split('-');
  return `${year}-${month}-${day}`;
}

/** Waits until the table reflects the given range, then returns its rows. */
async function rowsInRange(tour: TourPage, start: string, end: string): Promise<TourRecord[]> {
  await expect.poll(async () => {
    const rows = await tour.readRows();
    return rows.length > 0 && rows.every(row => {
      const iso = isoFromTourDate(row.date);
      return iso >= start && iso <= end;
    });
  }, {
    timeout: 30_000,
    message: `Expected Tour records within ${start} – ${end}. Staging needs tour data in the last ${data.rangeDays} days.`,
  }).toBe(true);
  return tour.readRows();
}

test.describe('Tour Smoke Tests @smoke @regression', () => {
  test('Tour page loads with tabs, actions and table headers', async ({ page }) => {
    const tour = new TourPage(page);
    await tour.open();

    for (const status of STATUSES) await expect(tour.tab(status)).toBeVisible();
    await expect(tour.dateButton).toBeVisible();
    await expect(tour.importButton).toBeVisible();
    await expect(tour.exportButton).toBeVisible();

    await tour.selectTab('All');
    await expect(tour.table.getByRole('columnheader')).toHaveText([
      '', 'Emp ID', 'Emp Name', 'Date', 'Type', 'HQ', 'Cluster', 'Status', 'Actions',
    ]);
  });
});

test.describe('Tour Regression Tests @regression', () => {
  let baseline: TourRecord[];

  test.beforeEach(async ({ page }) => {
    const tour = new TourPage(page);
    await tour.open();
    await tour.selectTab('All');
    await tour.selectDateRange(from, to);
    await tour.expectDateRange(from, to);
    baseline = await rowsInRange(tour, from, to);
  });

  test('Switching back to All restores the baseline', async ({ page }) => {
    const tour = new TourPage(page);
    await tour.selectTab('Approved');
    await tour.expectRecords(baseline.filter(row => row.status === 'Approved'));
    await tour.selectTab('All');
    await tour.expectRecords(baseline);
  });

  for (const status of ['Approved', 'Rejected'] as const) {
    test(`${status} tab shows exactly the ${status} records in range`, async ({ page }) => {
      const tour = new TourPage(page);
      await tour.selectTab(status);
      await tour.expectRecords(baseline.filter(row => row.status === status));
    });
  }

  test('Pending tab shows only Pending records, including those in range', async ({ page }) => {
    const tour = new TourPage(page);
    await tour.selectTab('Pending');
    // Pending lists everything awaiting a decision, regardless of the selected range.
    const pendingInRange = baseline.filter(row => row.status === 'Pending');
    await expect.poll(async () => {
      const rows = await tour.readRows();
      return rows.length >= pendingInRange.length && rows.every(row => row.status === 'Pending');
    }, { timeout: 30_000, message: 'Pending tab must list only Pending records' }).toBe(true);
    const shown = (await tour.readRows()).map(row => JSON.stringify(row));
    for (const row of pendingInRange) {
      expect(shown, `${row.employeeName} ${row.date} missing from Pending`).toContain(JSON.stringify(row));
    }
  });

  test('All tab records have valid dates and known statuses', async () => {
    for (const row of baseline) {
      expect(row.date).toMatch(/^\d{2}-\d{2}-\d{4}$/);
      const iso = isoFromTourDate(row.date);
      expect(new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10), row.date).toBe(iso);
      expect(['Pending', 'Approved', 'Rejected'], `${row.employeeName}: ${row.status}`).toContain(row.status);
    }
  });

  test('Narrowing the date range filters Tour records', async ({ page }) => {
    // Three range selections in one test.
    test.slow();
    const tour = new TourPage(page);
    const narrowFrom = daysBefore(to, data.narrowDays - 1);

    await tour.selectDateRange(narrowFrom, to);
    await tour.expectRecords(baseline.filter(row => isoFromTourDate(row.date) >= narrowFrom));

    await tour.selectDateRange(from, to);
    await tour.expectRecords(baseline);
  });

  test('Date range picker closes without changing the range', async ({ page }) => {
    const tour = new TourPage(page);
    const dialog = await tour.openDatePicker();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(tour.dateButton).toHaveAttribute('aria-expanded', 'false');
    await tour.expectDateRange(from, to);
  });

  test('Export downloads a nonempty file', async ({ page }, testInfo) => {
    const tour = new TourPage(page);
    await expect(tour.exportButton).toBeEnabled();
    const pending = page.waitForEvent('download');
    await tour.exportButton.click();
    const download = await pending;
    expect(await download.failure()).toBeNull();
    const file = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(file);
    expect((await stat(file)).size).toBeGreaterThan(0);
    // Export format has not been supplied; don't assume this is a CSV report.
    await testInfo.attach('tour-export', { body: await readFile(file), contentType: 'application/octet-stream' });
  });
});
