import { test, expect } from '../../fixtures/auth';
import { MenuPage, type MenuScreen } from '../../pages/MenuPage';

const screens: MenuScreen[] = [
  { name: 'STP', path: '/stp', heading: 'STP' },
  { name: 'MTP', path: '/mtp', heading: 'MTP' },
  { name: 'Reports', path: '/reports/performance', heading: 'Performance Report', search: 'Search name or employee code' },
  { name: 'Team', path: '/team-v2', heading: 'Team', search: 'Search name, email, mobile' },
  { name: 'Offices', path: '/offices', heading: 'Office Management', search: 'Search offices by name, city, or address' },
  { name: 'Territory', path: '/territories', heading: 'Territory', search: 'Search Headquarter' },
  { name: 'CRM', path: '/pois', heading: 'CRM', search: 'Search name, reference, ID, city' },
  { name: 'SKU Master', path: '/skus', heading: 'SKU Master', search: 'Search SKU, brand, molecule' },
  { name: 'Competitor Master', path: '/competitors', heading: 'Competitor Master', search: 'Search competitor, SKU, molecule' },
  { name: 'Knowledge', path: '/knowledge', heading: 'Knowledge Management', search: 'Search documents' },
  { name: 'Holidays', path: '/holidays', heading: 'Holidays', search: 'Search name or state' },
  { name: 'Delegated Admins', path: '/delegated-admins', heading: 'Delegated Admins', search: 'Search by name, email, EMP code' },
  { name: 'Org Settings', path: '/settings', heading: 'Settings' },
];

test.describe('Menu smoke @smoke @regression', () => {
  for (const screen of screens) {
    test(`${screen.name} opens`, async ({ page }) => {
      const menu = new MenuPage(page);
      await menu.open(screen);

      if (screen.name === 'Territory' || screen.name === 'CRM' || screen.name === 'Holidays') {
        await expect(page.getByRole('table').first()).toBeVisible();
      }
    });
  }
});
