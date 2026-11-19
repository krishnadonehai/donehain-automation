import { expect, type Locator, type Page } from '@playwright/test';

export class DashboardPage {
  constructor(private readonly page: Page) {}

  get greeting(): Locator {
    return this.page.getByRole('heading', { name: /Good (morning|afternoon|evening),/ });
  }

  section(name: string): Locator {
    return this.page.getByRole('heading', { name, exact: true });
  }

  async open(): Promise<void> {
    await this.page.goto('/dashboard');
    await expect(this.page).not.toHaveURL(/\/login/, { timeout: 30_000 });
    await expect(this.greeting).toBeVisible({ timeout: 30_000 });
  }
}
