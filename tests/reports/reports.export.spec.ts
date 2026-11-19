import { test, expect } from '../../fixtures/auth';
import { ReportsPage } from '../../pages/ReportsPage';
import { readFile, stat } from 'node:fs/promises';

test.describe('Reports Export @regression', () => {
  test('Performance report export downloads a nonempty file', async ({ page }, testInfo) => {
    const reports = new ReportsPage(page);
    await reports.open();

    const downloadPromise = page.waitForEvent('download');
    await reports.exportButton.click();
    const download = await downloadPromise;

    expect(await download.failure()).toBeNull();
    const file = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(file);
    expect((await stat(file)).size).toBeGreaterThan(0);
    expect((await readFile(file)).byteLength).toBeGreaterThan(0);

    await testInfo.attach('performance-report', {
      path: file,
      contentType: 'application/octet-stream',
    });
  });
});
