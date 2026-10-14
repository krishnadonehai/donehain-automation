
import { test, expect } from '../../fixtures/auth';
import { AttendancePage } from '../../pages/AttendancePage';

test.describe('Attendance Smoke Tests @smoke @regression', () => {
  test('Attendance page loads successfully', async ({ page }) => {
    const attendance = new AttendancePage(page);

    await attendance.open();

    await expect(attendance.searchInput).toBeVisible();
    await expect(attendance.table).toBeVisible();
    await expect(attendance.dateButton).toBeVisible();
    await expect(attendance.downloadReportButton).toBeVisible();
  });

  test('Attendance table has correct headers', async ({ page }) => {
    const attendance = new AttendancePage(page);

    await attendance.open();

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
  });

  test('Attendance filters are visible', async ({ page }) => {
    const attendance = new AttendancePage(page);

    await attendance.open();

    await expect(
      attendance.dropdownByText('All Departments')
    ).toBeVisible();

    await expect(
      attendance.dropdownByText('All Status')
    ).toBeVisible();

    await expect(attendance.searchInput).toHaveValue('');
  });
});
