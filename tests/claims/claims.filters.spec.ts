
import { test, expect } from '../../fixtures/auth';
import {
  ClaimsPage,
  type ClaimStatus,
} from '../../pages/ClaimsPage';

test.describe('Claims Status Filters', () => {
  const statuses: ClaimStatus[] = [
    'All',
    'Rejected',
    'Pending',
    'Approved',
    'System approved',
  ];

  for (const status of statuses) {
    test(`Filter claims by ${status}`, async ({ page }) => {
      const claims = new ClaimsPage(page);

      await claims.open();
      await claims.selectStatus(status);

      if (status !== 'All') {
        await claims.verifyRowStatus(status);
      }

      await expect(
        page.getByRole('tab', {
          name: status,
          exact: true,
        })
      ).toHaveAttribute('aria-selected', 'true');
    });
  }
});
