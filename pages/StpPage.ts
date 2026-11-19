import { expect, type Page } from '@playwright/test';

export class StpPage {
  constructor(private readonly page: Page) {}

  get heading() {
    return this.page.getByRole('heading', { name: 'STP', exact: true });
  }

  get exportButton() {
    return this.page.getByRole('button', { name: 'Export', exact: true });
  }

  get importButton() {
    return this.page.getByRole('button', { name: 'Import', exact: true });
  }

  get emptyState() {
    return this.page.getByText('No MR selected', { exact: true });
  }

  get financialYear() {
    return this.page.getByRole('combobox', { name: 'Financial year' });
  }

  async open() {
    await this.page.goto('/stp');
    await expect(this.heading).toBeVisible({ timeout: 30_000 });
    await expect(this.emptyState).toBeVisible();
  }

  async selectYear(label: string) {
    await this.financialYear.selectOption({ label });
  }
}
