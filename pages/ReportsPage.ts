import { expect, type Page } from '@playwright/test';
import { dateRangeButton } from '../utils/date-range';

export class ReportsPage {
  constructor(private readonly page: Page) {}

  get heading() {
    return this.page.getByRole('heading', { name: 'Performance Report', exact: true });
  }

  get searchInput() {
    return this.page.getByPlaceholder(/Search name or employee code/);
  }

  get exportButton() {
    return this.page.getByRole('button', { name: 'Export', exact: true });
  }

  get refreshButton() {
    return this.page.getByRole('button', { name: 'Refresh report', exact: true });
  }

  get dateButton() {
    return dateRangeButton(this.page);
  }

  async open() {
    await this.page.goto('/reports/performance');
    await expect(this.heading).toBeVisible({ timeout: 30_000 });
    await expect(this.searchInput).toBeVisible();
    await expect(this.dateButton).toBeVisible();
    await expect(this.exportButton).toBeVisible();
  }

  async search(query: string) {
    await this.searchInput.fill(query);
  }
}
