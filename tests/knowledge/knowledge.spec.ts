import { test, expect } from '../../fixtures/auth';
import { ListScreenPage } from '../../pages/ListScreenPage';

const SEARCH = /Search documents/;

test.describe('Knowledge @regression', () => {
  test('Knowledge Management shows search and import', async ({ page }) => {
    const knowledge = new ListScreenPage(page, '/knowledge', 'Knowledge Management');
    await knowledge.open();

    await expect(knowledge.searchBox(SEARCH)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import to Workspace', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete All', exact: true })).toBeVisible();
  });

  test('Search box accepts text and clears', async ({ page }) => {
    const knowledge = new ListScreenPage(page, '/knowledge', 'Knowledge Management');
    await knowledge.open();

    await knowledge.search(SEARCH, 'zz_knowledge_invalid_748159');
    await expect(knowledge.searchBox(SEARCH)).toHaveValue('zz_knowledge_invalid_748159');

    await knowledge.searchBox(SEARCH).clear();
    await expect(knowledge.searchBox(SEARCH)).toHaveValue('');
  });
});
