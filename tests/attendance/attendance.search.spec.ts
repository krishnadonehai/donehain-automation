
import { test, expect } from '../../fixtures/auth';
import { AttendancePage } from '../../pages/AttendancePage';
import data from '../../data/attendance.json';

test.describe('Attendance Search Tests @regression', () => {
  test.beforeEach(async ({ page }) => {
    const attendance = new AttendancePage(page);

    await attendance.open();
    await attendance.selectDate(data.date);

    await attendance.expectRows(
      data.employees,
      data.date
    );
  });

  test('Search MR returns expected employees', async ({ page }) => {
    const attendance = new AttendancePage(page);

    await attendance.searchEmployee(data.searchQuery);

    const expected = data.employees.filter(
      employee => data.searchExpectedIds.includes(employee.id)
    );

    expect(expected).toHaveLength(
      data.searchExpectedIds.length
    );

    await attendance.expectRows(expected, data.date);
  });

  test('Clearing search restores all records', async ({ page }) => {
    const attendance = new AttendancePage(page);

    await attendance.searchEmployee(data.searchQuery);

    await attendance.expectRows(
      data.employees.filter(employee =>
        data.searchExpectedIds.includes(employee.id)
      ),
      data.date
    );

    await attendance.searchInput.clear();

    await attendance.expectRows(
      data.employees,
      data.date
    );
  });

  test('Unknown employee shows zero records', async ({ page }) => {
    const attendance = new AttendancePage(page);

    await attendance.searchEmployee(data.noMatchQuery);

    await attendance.expectRows([], data.date);
  });
});
