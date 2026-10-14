
import { test, expect } from '../../fixtures/auth';
import { AttendancePage } from '../../pages/AttendancePage';
import {
  displayDate,
  todayInIndia,
  daysBefore,
} from '../../utils/dates';

test.describe('Attendance Date Tests', () => {
  
  test('Date picker opens and closes', async ({ page }) => {
    const attendance = new AttendancePage(page);

    await attendance.open();
    await attendance.dateButton.click();

    const dialog = page.getByRole('dialog');

    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(dialog).not.toBeVisible();
  });

  test('Previous date can be selected', async ({ page }) => {
    const attendance = new AttendancePage(page);

    const date =
      process.env.ATTENDANCE_DATE ||
      daysBefore(todayInIndia(), 1);

    await attendance.open();
    await attendance.selectDate(date);

    await expect(attendance.dateButton).toHaveText(
      displayDate(date)
    );

    await attendance.expectValidRows(date);
  });

  test('Today can be selected', async ({ page }) => {
    const attendance = new AttendancePage(page);

    const today = todayInIndia();

    await attendance.open();
    await attendance.selectDate(today);

    await expect(attendance.dateButton).toHaveText(
      displayDate(today)
    );

    await attendance.expectValidRows(today);
  });
});
