import { expect, type Locator, type Page } from '@playwright/test';
import { displayDate } from '../utils/dates';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export class RcpaPage {
  constructor(private readonly page: Page) {}

  get searchInput() {
    return this.page.getByRole('textbox', { name: 'Search reports' });
  }

  get table() {
    return this.page.getByRole('table');
  }

  get rows() {
    return this.table.locator('tbody tr');
  }

  get filtersButton() {
    return this.page.getByRole('button', { name: 'Filters', exact: true });
  }

  get emptyState() {
    return this.page.getByText(/No reports in this date range/i);
  }

  /** Single-day or range trigger on Field Voices. */
  get dateButton() {
    return this.page.locator('button[aria-haspopup="dialog"]').filter({
      hasText: /\d{2}-[A-Za-z]{3}-\d{4}/,
    });
  }

  /** @deprecated Prefer dateButton — Field Voices often shows a single day. */
  get dateRangeButton() {
    return this.dateButton;
  }

  async open() {
    await this.page.goto('/rcpa');
    await expect(
      this.page.getByRole('heading', { name: 'Field Voices', exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(this.searchInput).toBeVisible();
    await expect(this.dateButton).toBeVisible();
    // Default day can be empty — table is optional until a range with data is selected.
  }

  async verifyHeaders(headers: string[]) {
    await expect(this.table).toBeVisible({ timeout: 30_000 });
    for (const header of headers) {
      await expect(
        this.table.getByRole('columnheader', {
          name: header,
          exact: true,
        }),
      ).toBeVisible();
    }
  }

  async search(query: string) {
    await this.searchInput.fill(query);
  }

  async clearSearch() {
    await this.searchInput.clear();
  }

  getReportRow(reportId: string) {
    return this.rows.filter({
      has: this.page.locator('td:first-child', {
        hasText: new RegExp(`^#${reportId}$`),
      }),
    });
  }

  async verifyReport(
    reportId: string,
    expectedPoiId: string,
    expectedStatus: string,
  ) {
    const row = this.getReportRow(reportId);

    await expect(row).toHaveCount(1);
    await expect(row.locator('td').nth(2)).toContainText(expectedPoiId);
    await expect(row.locator('td').nth(5)).toContainText(expectedStatus);
  }

  async openDateRange() {
    await this.dateButton.click();
    await expect(this.dateButton).toHaveAttribute('aria-expanded', 'true');
    const dialogId = await this.dateButton.getAttribute('aria-controls');
    if (!dialogId) throw new Error('Date button has no aria-controls dialog reference.');
    const dialog = this.page.locator(`[id=${JSON.stringify(dialogId)}]`);
    await expect(dialog).toBeVisible();
    return dialog;
  }

  async getDisplayedDateRange() {
    return (await this.dateButton.innerText()).trim();
  }

  /**
   * Selects an inclusive range in the react-day-picker (same rules as Tour).
   */
  async selectDateRange(from: string, to: string): Promise<void> {
    if (from >= to) throw new Error(`Range must span at least two days: ${from} – ${to}`);
    const dialog = await this.openDateRange();

    const monthLabel = (iso: string) => {
      const [year, month] = iso.split('-').map(Number);
      return `${MONTH_NAMES[month - 1]} ${year}`;
    };
    const day = (iso: string) =>
      dialog
        .getByRole('grid', { name: monthLabel(iso), exact: true })
        .locator('button[name="day"]:not(.day-outside)')
        .getByText(String(Number(iso.slice(8))), { exact: true });

    await this.showMonth(dialog, from);

    const selection = async () =>
      dialog.getByRole('grid').evaluateAll(grids => {
        const names = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December',
        ];
        const dates = grids
          .flatMap(grid => {
            const label =
              document.getElementById(grid.getAttribute('aria-labelledby') ?? '')
                ?.textContent?.trim() ?? '';
            const [name, year] = label.split(' ');
            const month = String(names.indexOf(name) + 1).padStart(2, '0');
            return Array.from(
              grid.querySelectorAll(
                'button[name="day"][aria-selected="true"]:not(.day-outside)',
              ),
            ).map(
              button =>
                `${year}-${month}-${button.textContent!.trim().padStart(2, '0')}`,
            );
          })
          .sort();
        return { start: dates[0], end: dates.length > 1 ? dates.at(-1) : undefined };
      });

    let current = await selection();
    if (current.start !== from) {
      await day(from).click();
      current = await selection();
      if (current.start !== from) {
        await day(from).click();
        await expect.poll(async () => (await selection()).start).toBe(from);
      }
    }

    if ((await selection()).end !== to) {
      await this.showMonth(dialog, to);
      await day(to).click();
    }

    await expect(
      this.dateButton,
      `Calendar did not select ${from} – ${to}.`,
    ).toHaveText(
      new RegExp(
        `^${displayDate(from)}\\s*[–—-]\\s*${displayDate(to)}$`,
      ),
    );

    await this.page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  }

  private async showMonth(dialog: Locator, iso: string): Promise<void> {
    const [year, month] = iso.split('-').map(Number);
    const grid = dialog.getByRole('grid', {
      name: `${MONTH_NAMES[month - 1]} ${year}`,
      exact: true,
    });
    for (let step = 0; step < 36 && !(await grid.isVisible()); step++) {
      const first = await dialog.getByRole('grid').first().evaluate(
        g =>
          document.getElementById(g.getAttribute('aria-labelledby') ?? '')
            ?.textContent?.trim() ?? '',
      );
      const [name, shownYear] = first.split(' ');
      const shown = Number(shownYear) * 12 + MONTH_NAMES.indexOf(name);
      await dialog
        .getByRole('button', {
          name:
            year * 12 + month - 1 < shown
              ? 'Go to previous month'
              : 'Go to next month',
        })
        .click();
    }
    await expect(grid, `Calendar could not navigate to ${iso}.`).toBeVisible();
  }
}
