import { expect, type Locator, type Page } from '@playwright/test';
import { displayDate } from '../utils/dates';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export type DcrQuickRange =
  | 'Today'
  | 'Yesterday'
  | 'Last 7 days'
  | 'Last 30 days'
  | 'This Week'
  | 'This Month'
  | 'Last Month';

export type DcrRecord = {
  date: string;
  employee: string;
  manager: string;
  planned: string;
  actual: string;
  visitType: string;
  travelActual: string;
  travelEstimated: string;
  claims: string;
  status: string;
};

export class DcrPage {
  constructor(private readonly page: Page) {}

  get heading() {
    return this.page.getByRole('heading', { name: 'DCR', exact: true });
  }

  get searchInput() {
    return this.page.getByRole('textbox', { name: 'Search daily calls' });
  }

  get exportButton() {
    return this.page.getByRole('button', { name: 'Export', exact: true });
  }

  get filtersButton() {
    return this.page.getByRole('button', { name: /^Filters/ });
  }

  get dateButton() {
    return this.page.locator('button[aria-haspopup="dialog"]').filter({
      hasText: /\d{2}-[A-Za-z]{3}-\d{4}/,
    });
  }

  get table() {
    return this.page.getByRole('table').filter({
      has: this.page.getByRole('columnheader', { name: 'Claim Status', exact: true }),
    });
  }

  get dataRows() {
    return this.table.locator('tbody tr').filter({
      has: this.page.locator('td:nth-child(2)'),
    });
  }

  get emptyState() {
    return this.table.getByText('No activity for this period', { exact: true });
  }

  async open() {
    await this.page.goto('/daily-calls');
    await expect(this.heading).toBeVisible({ timeout: 30_000 });
    await expect(this.searchInput).toBeVisible();
    await expect(this.dateButton).toBeVisible();
    await expect(this.exportButton).toBeVisible();
    await expect(this.table).toBeVisible();
  }

  async verifyHeaders(headers: string[]) {
    await expect(this.table.getByRole('columnheader')).toHaveText(headers);
  }

  async search(query: string) {
    await this.searchInput.fill(query);
  }

  async clearSearch() {
    await this.searchInput.clear();
  }

  async readRows(): Promise<DcrRecord[]> {
    return this.dataRows.evaluateAll(rows => rows.map(row => {
      const cells = Array.from(row.querySelectorAll('td')).map(
        cell => cell.textContent?.replace(/\s+/g, ' ').trim() || '',
      );
      if (cells.length < 10) {
        return {
          date: cells[0] ?? '',
          employee: cells[1] ?? '',
          manager: '',
          planned: cells[2] ?? '',
          actual: cells[3] ?? '',
          visitType: cells[4] ?? '',
          travelActual: cells[5] ?? '',
          travelEstimated: cells[6] ?? '',
          claims: cells[7] ?? '',
          status: cells[8] ?? '',
        };
      }
      return {
        date: cells[0],
        employee: cells[1],
        manager: cells[2],
        planned: cells[3],
        actual: cells[4],
        visitType: cells[5],
        travelActual: cells[6],
        travelEstimated: cells[7],
        claims: cells[8],
        status: cells[9],
      };
    }));
  }

  row(date: string, employee: string) {
    return this.dataRows.filter({ hasText: date }).filter({ hasText: employee });
  }

  async expectRecord(expected: DcrRecord) {
    await expect.poll(async () => {
      const rows = await this.readRows();
      return rows.some(row =>
        row.date === expected.date &&
        row.employee === expected.employee &&
        row.manager === expected.manager &&
        row.planned === expected.planned &&
        row.actual === expected.actual &&
        row.visitType === expected.visitType &&
        row.travelActual === expected.travelActual &&
        row.travelEstimated === expected.travelEstimated &&
        row.claims === expected.claims &&
        row.status === expected.status
      );
    }, {
      timeout: 30_000,
      message: `DCR row ${expected.date} ${expected.employee} did not match`,
    }).toBe(true);
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

  async selectQuickRange(label: DcrQuickRange) {
    const dialog = await this.openDateRange();
    await dialog.getByRole('button', { name: label, exact: true }).click();
    await this.page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }

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

    const startLabel = displayDate(from);
    const endLabel = displayDate(to);
    // Highlighted days stop at the visible month, so the button label is the real range.
    const shown = async () => {
      const text = (await this.dateButton.innerText()).replace(/\s+/g, ' ');
      const dates = [...text.matchAll(/\d{2}-[A-Za-z]{3}-\d{4}/g)].map(match => match[0]);
      return { start: dates[0], end: dates.at(-1) };
    };

    await this.showMonth(dialog, from);
    if ((await shown()).start !== startLabel) {
      await day(from).click();
      if ((await shown()).start !== startLabel) {
        await day(from).click();
        await expect.poll(async () => (await shown()).start).toBe(startLabel);
      }
    }

    if ((await shown()).end !== endLabel) {
      await this.showMonth(dialog, to);
      await day(to).click();
      await expect.poll(async () => (await shown()).end).toBe(endLabel);
    }

    await expect(this.dateButton, `Calendar did not select ${from} – ${to}.`).toHaveText(
      new RegExp(`^${startLabel}\\s*[–—-]\\s*${endLabel}$`),
    );

    await this.page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
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
