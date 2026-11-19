import { test, expect } from '../../fixtures/auth';
import { ListScreenPage } from '../../pages/ListScreenPage';

const SEARCH = /Search name, email, mobile/;

test.describe('Team @regression', () => {
  test('Team shows the summary, filters and actions', async ({ page }) => {
    const team = new ListScreenPage(page, '/team-v2', 'Team');
    await team.open();

    await expect(page.getByText('Total Employees', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Employee', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bulk Import', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
  });

  test('Search box accepts text and clears', async ({ page }) => {
    const team = new ListScreenPage(page, '/team-v2', 'Team');
    await team.open();

    await team.search(SEARCH, 'zz_team_invalid_748159');
    await expect(team.searchBox(SEARCH)).toHaveValue('zz_team_invalid_748159');

    await team.searchBox(SEARCH).clear();
    await expect(team.searchBox(SEARCH)).toHaveValue('');
    await expect(page.getByText('Total Employees', { exact: true })).toBeVisible();
  });
});
