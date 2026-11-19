import { test, expect } from '../../fixtures/auth';
import { DcrPage } from '../../pages/DcrPage';
import data from '../../data/dcr.json';
import { readFile, stat } from 'node:fs/promises';

test.describe('DCR Export Tests @regression', () => {
  test('DCR CSV downloads for the selected range', async ({ page }, testInfo) => {
    const dcr = new DcrPage(page);

    await dcr.open();
    await dcr.selectDateRange(data.range.from, data.range.to);

    const downloadPromise = page.waitForEvent('download');
    await dcr.exportButton.click();
    const download = await downloadPromise;

    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toBe(
      `DCR_${data.range.from}_to_${data.range.to}.csv`,
    );

    const filePath = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(filePath);

    expect((await stat(filePath)).size).toBeGreaterThan(0);
    const content = await readFile(filePath, 'utf8');
    expect(content.trim().length).toBeGreaterThan(0);
    expect(content).toContain(data.search.employeeCode);

    await testInfo.attach('dcr-report', {
      path: filePath,
      contentType: 'text/csv',
    });
  });
});
