import { test, expect } from '../../fixtures/auth';
import { AttendancePage } from '../../pages/AttendancePage';
import data from '../../data/attendance.json';
import { stat } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  const attendance = new AttendancePage(page);
  await attendance.open();
  await expect(attendance.dropdownByText('All Departments')).toBeVisible();
  await expect(attendance.dropdownByText('All Status')).toBeVisible();
  await expect(attendance.searchInput).toHaveValue('');
  await attendance.expectRows(data.employees, data.date);
});

test('Table headers and expected employee records', async ({ page }) => {
  const attendance = new AttendancePage(page);
  await expect(attendance.table.getByRole('columnheader')).toHaveText([
    'Name', 'EMP ID', 'Designation', 'Date', 'Check-in', 'Check-out',
    'Duration (h)', 'Status', 'Approval',
  ]);
});

test('Search mr returns both MR employees and excludes the Manager', async ({ page }) => {
  const attendance = new AttendancePage(page);
  await attendance.searchEmployee(data.searchQuery);
  await expect(attendance.searchInput).toHaveValue(data.searchQuery);
  const expected = data.employees.filter(e => data.searchExpectedIds.includes(e.id));
  expect(expected.length).toBe(data.searchExpectedIds.length);
  await attendance.expectRows(expected, data.date);
});

test('Clearing search restores all expected records', async ({ page }) => {
  const attendance = new AttendancePage(page);
  await attendance.searchEmployee(data.searchQuery);
  await attendance.expectRows(data.employees.filter(e => data.searchExpectedIds.includes(e.id)), data.date);
  await attendance.searchInput.clear();
  await attendance.expectRows(data.employees, data.date);
});

test('Unknown search shows zero records', async ({ page }) => {
  const attendance = new AttendancePage(page);
  await attendance.searchEmployee(data.noMatchQuery);
  await attendance.expectRows([], data.date);
});

for (const department of data.departments) {
  test(`Department ${department} can be selected and reset`, async ({ page }) => {
    const attendance = new AttendancePage(page);
    await attendance.selectOption('All Departments', department);
    // This verifies selection, not employee department membership.
    await attendance.selectOption(department, 'All Departments');
    await attendance.expectRows(data.employees, data.date);
  });
}

for (const status of ['Present', 'Absent']) {
  test(`Status ${status} returns exactly the expected employee records`, async ({ page }) => {
    const attendance = new AttendancePage(page);
    await attendance.selectOption('All Status', status);
    await attendance.expectRows(data.employees.filter(e => e.status === status), data.date);
  });
}

test('Date picker opens and closes', async ({ page }) => {
  const attendance = new AttendancePage(page);
  await attendance.dateButton.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('Attendance report downloads successfully and is not empty', async ({ page }, testInfo) => {
  const attendance = new AttendancePage(page);
  const downloadPromise = page.waitForEvent('download');
  await attendance.downloadReportButton.click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.csv$/i);
  const file = testInfo.outputPath('attendance-report.csv');
  await download.saveAs(file);
  expect((await stat(file)).size).toBeGreaterThan(0);
  await testInfo.attach('attendance-report', { path: file, contentType: 'text/csv' });
});
