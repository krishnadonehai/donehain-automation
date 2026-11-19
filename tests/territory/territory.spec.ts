import { test, expect } from '../../fixtures/auth';
import { ListScreenPage } from '../../pages/ListScreenPage';

const SEARCH = /Search Headquarter, station/;

test.describe('Territory @regression', () => {
  test('Territory shows the station table and actions', async ({ page }) => {
    const territory = new ListScreenPage(page, '/territories', 'Territory');
    await territory.open();

    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'HQ', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Station', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add new', exact: true })).toBeVisible();
  });

  test('Search by the first station ID keeps matching rows', async ({ page }) => {
    const territory = new ListScreenPage(page, '/territories', 'Territory');
    await territory.open();

    const key = await territory.firstRowKey();
    expect(key).not.toBe('');

    await territory.search(SEARCH, key);

    await expect.poll(async () => {
      const texts = await territory.rows.allInnerTexts();
      return texts.length > 0 && texts.every(text => text.includes(key));
    }, { timeout: 30_000, message: `Territory rows did not match ${key}` }).toBe(true);
  });
});
