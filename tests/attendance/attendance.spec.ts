
import { test, expect } from '../../fixtures/auth';
import {
  AttendancePage,
  type AttendanceRow,
} from '../../pages/AttendancePage';

import data from '../../data/attendance.json';
import { stat } from 'node:fs/promises';
import { todayInIndia } from '../../utils/dates';

const testDate =
  process.env.ATTENDANCE_DATE || todayInIndia();

function sortRows(rows: AttendanceRow[]) {
  return [...rows].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
}

test.beforeEach(async ({ page }) => {
  const attendance = new AttendancePage(page);

  await attendance.open();
  await attendance.selectDate(testDate);

  await expect(
    attendance.dropdownByText('All Departments')
  ).toBeVisible();

  await expect(
    attendance.dropdownByText('All Status')
  ).toBeVisible();

  await expect(attendance.searchInput).toHaveValue('');

  await attendance.expectValidRows(testDate);

  // Validate exact records for the approved regression date.
  if (testDate === data.date) {
    await attendance.expectRows(
      data.employees,
      data.date
    );
  }
});

test('Table headers and expected employee records', async ({ page }) => {
  const attendance = new AttendancePage(page);

  await expect(
    attendance.table.getByRole('columnheader')
  ).toHaveText([
    'Name',
    'EMP ID',
    'Designation',
    'Date',
    'Check-in',
    'Check-out',
    'Duration (h)',
    'Status',
    'Approval',
  ]);

  await attendance.expectValidRows(testDate);
});

test('Search MR filters matching employees', async ({ page }) => {
  const attendance = new AttendancePage(page);

  const baseline = await attendance.readRows();

  await attendance.searchEmployee(data.searchQuery);

  await expect(attendance.searchInput).toHaveValue(
    data.searchQuery
  );

  const query = data.searchQuery.toLowerCase();

  const expected = baseline.filter(row =>
    row.name.toLowerCase().includes(query) ||
    row.designation.toLowerCase().includes(query)
  );

  await expect.poll(
    async () => sortRows(await attendance.readRows()),
    { timeout: 15000 }
  ).toEqual(sortRows(expected));
});

test('Clearing search restores records', async ({ page }) => {
  const attendance = new AttendancePage(page);

  const baseline = await attendance.readRows();

  await attendance.searchEmployee(data.searchQuery);

  await expect(attendance.searchInput).toHaveValue(
    data.searchQuery
  );

  await attendance.searchInput.clear();

  await expect.poll(
    async () => sortRows(await attendance.readRows()),
    { timeout: 15000 }
  ).toEqual(sortRows(baseline));
});

test('Unknown search shows zero records', async ({ page }) => {
  const attendance = new AttendancePage(page);

  await attendance.searchEmployee(data.noMatchQuery);

  await expect(attendance.dataRows).toHaveCount(0, {
    timeout: 15000,
  });
});

for (const department of data.departments) {
  test(
    `Department ${department} can be selected and reset`,
    async ({ page }) => {
      const attendance = new AttendancePage(page);

      const baseline = await attendance.readRows();

      await attendance.selectOption(
        'All Departments',
        department
      );

      await attendance.selectOption(
        department,
        'All Departments'
      );

      await expect.poll(
        async () => sortRows(await attendance.readRows()),
        { timeout: 15000 }
      ).toEqual(sortRows(baseline));
    }
  );
}

for (const status of ['Present', 'Absent']) {
  test(
    `Status ${status} filters employee records`,
    async ({ page }) => {
      const attendance = new AttendancePage(page);

      const baseline = await attendance.readRows();

      await attendance.selectOption('All Status', status);

      const expected = baseline.filter(
        employee => employee.status === status
      );

      await expect.poll(
        async () => sortRows(await attendance.readRows()),
        { timeout: 15000 }
      ).toEqual(sortRows(expected));
    }
  );
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

  await testInfo.attach('attendance-report', {
    path: file,
    contentType: 'text/csv',
  });
});
