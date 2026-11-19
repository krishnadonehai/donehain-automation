import { test, expect } from '../../fixtures/auth';
import { ListScreenPage } from '../../pages/ListScreenPage';

const SEARCH = /Search SKU, brand, molecule/;

test.describe('SKU Master @regression', () => {
  test('SKU Master shows the table, active/inactive counts and actions', async ({ page }) => {
    const sku = new ListScreenPage(page, '/skus', 'SKU Master');
    await sku.open();

    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'SKU', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Brand', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Active\s*\d+$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Inactive\s*\d+$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add SKU', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeVisible();
  });

  test('Search by the first SKU code keeps matching rows', async ({ page }) => {
    const sku = new ListScreenPage(page, '/skus', 'SKU Master');
    await sku.open();

    const key = await sku.firstRowKey();
    expect(key).not.toBe('');

    await sku.search(SEARCH, key);

    await expect.poll(async () => {
      const texts = await sku.rows.allInnerTexts();
      return texts.length > 0 && texts.every(text => text.includes(key));
    }, { timeout: 30_000, message: `SKU rows did not match ${key}` }).toBe(true);
  });
});
