
import { test, expect } from '../../fixtures/auth';
import { AttendancePage } from '../../pages/AttendancePage';
import { stat, readFile } from 'node:fs/promises';

test.describe('Attendance Export Tests @regression', () => {
  test('Attendance CSV report downloads successfully', async ({ page }, testInfo) => {
    const attendance = new AttendancePage(page);

    await attendance.open();

    const downloadPromise = page.waitForEvent('download');

    await attendance.downloadReportButton.click();

    const download = await downloadPromise;

    expect(await download.failure()).toBeNull();

    expect(download.suggestedFilename()).toMatch(/\.csv$/i);

    const filePath = testInfo.outputPath(
      'attendance-report.csv'
    );

    await download.saveAs(filePath);

    const fileStats = await stat(filePath);

    expect(fileStats.size).toBeGreaterThan(0);

    const content = await readFile(filePath, 'utf8');

    expect(content.trim().length).toBeGreaterThan(0);

    await testInfo.attach('attendance-report', {
      path: filePath,
      contentType: 'text/csv',
    });
  });
});
