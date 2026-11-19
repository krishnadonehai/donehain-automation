import { test, expect } from '../../fixtures/auth';
import { ListScreenPage } from '../../pages/ListScreenPage';

const CRM = /C\s*R\s*M/;
const SEARCH = /Search name, reference, ID/;

test.describe('CRM @regression', () => {
  test('CRM shows the customer table, list/map toggle and actions', async ({ page }) => {
    const crm = new ListScreenPage(page, '/pois', CRM);
    await crm.open();

    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assign MR', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'List', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Map', exact: true })).toBeVisible();
  });

  test('Search by the first customer ID keeps matching rows', async ({ page }) => {
    const crm = new ListScreenPage(page, '/pois', CRM);
    await crm.open();

    const key = await crm.firstRowKey();
    expect(key).not.toBe('');

    await crm.search(SEARCH, key);

    await expect.poll(async () => {
      const texts = await crm.rows.allInnerTexts();
      return texts.length > 0 && texts.every(text => text.includes(key));
    }, { timeout: 30_000, message: `CRM rows did not match ${key}` }).toBe(true);
  });

  test('Unknown search shows no customers', async ({ page }) => {
    const crm = new ListScreenPage(page, '/pois', CRM);
    await crm.open();

    await crm.search(SEARCH, 'zz_crm_invalid_748159');

    await expect(crm.rows).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText('TOTAL POIS', { exact: false })).toBeVisible();
  });
});
