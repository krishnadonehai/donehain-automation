import { test, expect } from '../../fixtures/auth';
import { TourPage, type TourStatus } from '../../pages/TourPage';
import data from '../../data/tour.json';
import { readFile, stat, writeFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  const tour = new TourPage(page);
  await tour.open();
  await tour.selectTab('All');
  await tour.expectDateRange(data.range.from, data.range.to);
  // Wait for the real baseline before exercising filters (including empty tabs).
  await tour.expectRecords(data.records);
});

test('Tour table headers and supplied records', async ({ page }) => {
  const tour = new TourPage(page);
  await expect(tour.table.getByRole('columnheader')).toHaveText([
    '', 'Emp ID', 'Emp Name', 'Date', 'Type', 'HQ', 'Cluster', 'Status', 'Actions',
  ]);
  await tour.expectRecords(data.records);
});

for (const status of ['All', 'Pending', 'Approved', 'Rejected'] as TourStatus[]) {
  test(`${status} tab shows the expected Tour records`, async ({ page }) => {
    const tour = new TourPage(page);
    // Exercise switching BACK to All instead of clicking only the initial tab.
    if (status === 'All') {
      await tour.selectTab('Pending');
      await tour.expectRecords(data.records.filter(row => row.status === 'Pending'));
    }
    await tour.selectTab(status);
    const expected = status === 'All' ? data.records : data.records.filter(row => row.status === status);
    await tour.expectRecords(expected);
    console.log(`${status}: verified ${expected.length} record(s)`);
    if (status !== 'All') {
      await tour.selectTab('All');
      await tour.expectRecords(data.records);
    }
  });
}

test('Displayed Tour dates fall within the selected range', async ({ page }) => {
  const tour = new TourPage(page);
  const rows = await tour.readRows();
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.date).toMatch(/^\d{2}-\d{2}-\d{4}$/);
    const [day, month, year] = row.date.split('-');
    const iso = `${year}-${month}-${day}`;
    expect(new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10)).toBe(iso);
    expect(iso >= data.range.from && iso <= data.range.to, `${row.employeeName}: ${row.date}`).toBe(true);
  }
});

test('Date range picker opens, closes and saves its controls for the next test update', async ({ page }, testInfo) => {
  const tour = new TourPage(page);
  const dialog = await tour.openDatePicker();
  const htmlPath = testInfo.outputPath('tour-date-picker.html');
  await writeFile(htmlPath, await dialog.evaluate(element => element.outerHTML), 'utf-8');
  await testInfo.attach('tour-date-picker-html', { path: htmlPath, contentType: 'text/html' });
  await testInfo.attach('tour-date-picker', {
    body: await dialog.screenshot(), contentType: 'image/png',
  });
  console.log('Calendar markup saved:', htmlPath);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(tour.dateButton).toHaveAttribute('aria-expanded', 'false');
  await tour.expectDateRange(data.range.from, data.range.to);
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
  console.log('Tour export saved:', file);
});
