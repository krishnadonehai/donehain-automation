
import { test, expect } from '../../fixtures/auth';
import { AttendancePage } from '../../pages/AttendancePage';
import data from '../../data/attendance.json';

test.describe('Attendance Filter Tests @regression', () => {
  test.beforeEach(async ({ page }) => {
    const attendance = new AttendancePage(page);

    await attendance.open();
    await attendance.selectDate(data.date);

    await attendance.expectRows(
      data.employees,
      data.date
    );
  });

  for (const department of data.departments) {
    test(`Department ${department} can be selected and reset`, async ({ page }) => {
      const attendance = new AttendancePage(page);

      await attendance.selectOption(
        'All Departments',
        department
      );

      await attendance.selectOption(
        department,
        'All Departments'
      );

      await attendance.expectRows(
        data.employees,
        data.date
      );
    });
  }

  for (const status of ['Present', 'Absent']) {
    test(`Status ${status} returns expected employees`, async ({ page }) => {
      const attendance = new AttendancePage(page);

      await attendance.selectOption(
        'All Status',
        status
      );

      const expected = data.employees.filter(
        employee => employee.status === status
      );

      await attendance.expectRows(
        expected,
        data.date
      );
    });
  }

  test('Reset status filter restores all employees', async ({ page }) => {
    const attendance = new AttendancePage(page);

    await attendance.selectOption(
      'All Status',
      'Absent'
    );

    await attendance.expectRows(
      data.employees.filter(e => e.status === 'Absent'),
      data.date
    );

    await attendance.selectOption(
      'Absent',
      'All Status'
    );

    await attendance.expectRows(
      data.employees,
      data.date
    );
  });
});
