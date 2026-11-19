
import { expect, type Page } from '@playwright/test';

export type ClaimStatus =
  | 'All'
  | 'Rejected'
  | 'Pending'
  | 'Approved'
  | 'System approved';

export class ClaimsPage {
  constructor(private readonly page: Page) {}

  get searchInput() {
    return this.page.getByPlaceholder(
      'Name, employee code, or claim ID'
    );
  }

  get table() {
    return this.page.getByRole('table');
  }

  get rows() {
    return this.table.locator('tbody tr');
  }

  get monthlyRegister() {
    return this.page.locator('a[href="/claims/monthly"]');
  }

  async open() {
    await this.page.goto('/claims');

    await expect(this.searchInput).toBeVisible();
    await expect(this.table).toBeVisible();
  }

  async verifyHeaders() {
    const headers = [
      'Claim ID',
      'Date',
      'Name',
      'Emp ID',
      'Est Distance (km)',
      'Est Amount (₹)',
      'Distance traveled (km)',
      'Travel Allowance (₹)',
      'Daily Allowance (₹)',
      'Total (₹)',
      'Status',
      'Actions',
    ];

    for (const header of headers) {
      await expect(
        this.table.getByRole('columnheader', {
          name: header,
          exact: true,
        })
      ).toBeVisible();
    }
  }

  async search(query: string) {
    await this.searchInput.fill(query);
  }

  async clearSearch() {
    await this.searchInput.fill('');
  }

  async selectStatus(status: ClaimStatus) {
    await this.page.getByRole('tab', {
      name: status,
      exact: true,
    }).click();

    await expect(
      this.page.getByRole('tab', {
        name: status,
        exact: true,
      })
    ).toHaveAttribute('aria-selected', 'true');
  }

  async verifyRowStatus(status: Exclude<ClaimStatus, 'All'>) {
    const count = await this.rows.count();

    for (let i = 0; i < count; i++) {
      const cell = this.rows.nth(i).locator('td').nth(10);
      const actual = await cell.locator('span').first().innerText();

      expect(actual.trim().toLowerCase()).toBe(
        status.toLowerCase()
      );
    }
  }

  async getClaimRow(claimId: string) {
    return this.rows.filter({
      has: this.page.locator('td:first-child', {
        hasText: new RegExp(`^${claimId}$`),
      }),
    });
  }

  async viewClaim(claimId: string) {
    const row = await this.getClaimRow(claimId);

    await expect(row).toHaveCount(1);
    await row.getByRole('button', {
      name: 'View',
    }).click();
  }

  async openMonthlyRegister() {
    await this.monthlyRegister.click();
    await expect(this.page).toHaveURL(/\/claims\/monthly\/?$/);
  }
}
