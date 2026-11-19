import { test, expect } from '../../fixtures/auth';
import { DashboardPage } from '../../pages/DashboardPage';

const SECTIONS = [
  "Today's Attendance",
  'CRM Overview',
  'Risk Overview',
  'Attendance by Office',
  'Visit Overview',
  'Claims',
  'Weekly Attendance Trend',
  'Weekly Claims Trend',
];

test.describe('Dashboard @smoke @regression', () => {
  test('Dashboard opens with the greeting and summary sections', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.open();

    await expect(page.getByText(/what.s happening across your organization/i)).toBeVisible();
    for (const name of SECTIONS) {
      await expect(dashboard.section(name)).toBeVisible();
    }
    await expect(page.getByRole('combobox').filter({ hasText: 'All categories' })).toBeVisible();
  });

  test('View attendance opens the attendance page', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.open();

    await page.getByRole('link', { name: 'View attendance', exact: true }).click();
    await expect(page).toHaveURL(/\/attendance\/?$/);
    await expect(page.getByRole('heading', { name: 'Attendance Management', exact: true })).toBeVisible();
  });

  test('View All opens the claims page', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.open();

    await page.getByRole('link', { name: 'View All', exact: true }).click();
    await expect(page).toHaveURL(/\/claims\/?$/);
    await expect(page.getByRole('heading', { name: 'Claims', exact: true })).toBeVisible();
  });

  test('Office details opens office management', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.open();

    await page.getByRole('link', { name: 'View Details', exact: true }).click();
    await expect(page).toHaveURL(/\/offices\/?$/);
    await expect(page.getByRole('heading', { name: 'Office Management', exact: true })).toBeVisible();
  });
});
