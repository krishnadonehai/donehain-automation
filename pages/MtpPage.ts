import { expect, type Page } from '@playwright/test';

export class MtpPage {
  constructor(private readonly page: Page) {}

  get heading() {
    return this.page.getByRole('heading', { name: 'MTP', exact: true });
  }

  get emptyState() {
    return this.page.getByText('No MR selected', { exact: true });
  }

  get financialYear() {
    return this.page.getByRole('combobox', { name: 'Financial year' });
  }

  get month() {
    return this.page.getByRole('combobox', { name: 'Month' });
  }

  async open() {
    await this.page.goto('/mtp');
    await expect(this.heading).toBeVisible({ timeout: 30_000 });
    await expect(this.emptyState).toBeVisible();
  }

  async selectMonth(label: string) {
    await this.month.selectOption({ label });
  }
}
