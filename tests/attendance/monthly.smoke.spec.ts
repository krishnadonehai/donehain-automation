
import { test, expect } from '../../fixtures/auth';
import { MonthlyAttendancePage } from '../../pages/MonthlyAttendancePage';
import { stat } from 'node:fs/promises';

test.describe('Monthly Smoke Tests @smoke @regression', () => {
  test('Export Payroll Excel downloads successfully', async ({ page }, testInfo) => {
    const monthly = new MonthlyAttendancePage(page);

    await monthly.open();

    const downloadPromise = page.waitForEvent('download', {
      timeout: 30000,
    });

    await monthly.exportPayrollButton.click();

    const download = await downloadPromise;

    expect(await download.failure()).toBeNull();

    expect(download.suggestedFilename()).toMatch(
      /\.(xlsx|xls)$/i
    );

    const filePath = testInfo.outputPath(
      download.suggestedFilename()
    );

    await download.saveAs(filePath);

    expect((await stat(filePath)).size).toBeGreaterThan(0);

    await testInfo.attach('monthly-payroll-excel', {
      path: filePath,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  });
});
