import { expect, type Locator, type Page } from '@playwright/test';

/** Shared helpers for DoneHai list screens: heading, search box, and table rows. */
export class ListScreenPage {
  constructor(
    private readonly page: Page,
    private readonly path: string,
    private readonly heading: string | RegExp,
  ) {}

  get headingLocator(): Locator {
    return typeof this.heading === 'string'
      ? this.page.getByRole('heading', { name: this.heading, exact: true }).first()
      : this.page.getByRole('heading', { name: this.heading }).first();
  }

  get rows(): Locator {
    return this.page.locator('tbody tr');
  }

  async open(): Promise<void> {
    await this.page.goto(this.path);
    await expect(this.page).not.toHaveURL(/\/login/, { timeout: 30_000 });
    await expect(this.headingLocator).toBeVisible({ timeout: 30_000 });
  }

  searchBox(placeholder: RegExp): Locator {
    return this.page.getByPlaceholder(placeholder);
  }

  async search(placeholder: RegExp, text: string): Promise<void> {
    await this.searchBox(placeholder).fill(text);
  }

  /** First non-empty cell of the first table row (skips checkbox cells). */
  async firstRowKey(): Promise<string> {
    await expect(this.rows.first()).toBeVisible({ timeout: 30_000 });
    // Rows can be empty or a "Loading…" placeholder while data loads, so wait for real data.
    // Use the first visible line of the first non-empty cell (e.g. the code, not a badge beside it).
    const readKey = () => this.rows.first().evaluate(row => {
      if (/Loading/i.test(row.textContent || '')) return '';
      const cells = [...row.querySelectorAll('td')]
        .map(cell => (cell as HTMLElement).innerText || '')
        .map(text => text.split('\n').map(line => line.trim()).filter(Boolean))
        .filter(lines => lines.length > 0);
      return cells[0]?.[0] ?? '';
    });

    await expect.poll(readKey, { timeout: 30_000, message: 'First table row never showed data' }).not.toBe('');
    return readKey();
  }
}
