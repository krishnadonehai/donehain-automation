import { expect, type Page } from '@playwright/test';

export type MenuScreen = {
  name: string;
  path: string;
  heading: string;
  search?: string;
};

export class MenuPage {
  constructor(private readonly page: Page) {}

  async open(screen: MenuScreen) {
    await this.page.goto(screen.path);
    await expect(this.page).not.toHaveURL(/\/login/, { timeout: 30_000 });

    const name = screen.heading === 'CRM'
      ? /C\s*R\s*M/
      : new RegExp(`^${screen.heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    const heading = this.page.getByRole('heading', { name }).first();
    await expect(heading).toBeVisible({ timeout: 30_000 });

    if (screen.search) {
      await expect(this.page.getByPlaceholder(screen.search, { exact: false })).toBeVisible();
    }
  }
}
