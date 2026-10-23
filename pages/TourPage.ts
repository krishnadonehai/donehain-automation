import { expect, type Locator, type Page } from '@playwright/test';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export type TourRecord = {
  employeeId: string;
  employeeName: string;
  date: string;
  type: string;
  hq: string;
  cluster: string;
  status: string;
};

export type TourStatus = 'All' | 'Pending' | 'Approved' | 'Rejected';

export function displayTourDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== iso) throw new Error(`Invalid fixture date: ${iso}`);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(day).padStart(2, '0')}-${months[month - 1]}-${year}`;
}

export class TourPage {
  constructor(readonly page: Page) {}

  get table() {
    return this.page.getByRole('table').filter({
      has: this.page.getByRole('columnheader', { name: 'Emp Name', exact: true }),
    });
  }

  get rows() {
    return this.table.locator('tbody tr').filter({
      has: this.page.locator('td:nth-child(9)'),
    });
  }

  get dateButton() {
    // While only a range start is picked the trigger shows a single date.
    return this.page.locator('button[aria-haspopup="dialog"]').filter({
      hasText: /\d{2}-[A-Za-z]{3}-\d{4}/,
    });
  }

  get exportButton() {
    return this.page.getByRole('button', { name: 'Export', exact: true });
  }

  get importButton() {
    return this.page.getByRole('button', { name: 'Import', exact: true });
  }

  tab(status: TourStatus) {
    return this.page.getByRole('tab', { name: status, exact: true });
  }

  async open(): Promise<void> {
    await this.page.goto('/beats');
    await expect(this.tab('All')).toBeVisible({ timeout: 30_000 });
    await expect(this.table).toBeVisible();
  }

  async selectTab(status: TourStatus): Promise<void> {
    // DoneHai can reset to the Pending tab while records reload, so re-click until it sticks.
    await expect(async () => {
      await this.tab(status).click();
      await expect(this.tab(status)).toHaveAttribute('aria-selected', 'true', { timeout: 3000 });
    }).toPass({ timeout: 20_000 });
    for (const other of ['All', 'Pending', 'Approved', 'Rejected'] as const) {
      if (other !== status) await expect(this.tab(other)).toHaveAttribute('aria-selected', 'false');
    }
  }

  async expectDateRange(from: string, to: string): Promise<void> {
    const expected = new RegExp(`^${displayTourDate(from)}\\s*[–—-]\\s*${displayTourDate(to)}$`);
    await expect(this.dateButton,
      'Tour date range differs from data/tour.json. Confirm the selected range and approved test data.'
    ).toHaveText(expected);
  }

  async readRows(): Promise<TourRecord[]> {
    return this.rows.evaluateAll(rows => rows.map(row => {
      const cells = Array.from(row.querySelectorAll('td')).map(cell => cell.textContent?.trim() || '');
      // Cell 0 is the selection checkbox; it is not the employee ID.
      return {
        employeeId: cells[1], employeeName: cells[2], date: cells[3],
        type: cells[4], hq: cells[5], cluster: cells[6], status: cells[7],
      };
    }));
  }

  async expectRecords(expected: TourRecord[]): Promise<void> {
    // Employee IDs repeat across dates. Compare full records, keeping duplicates.
    const normalize = (rows: TourRecord[]) => rows.map(row => JSON.stringify([
      row.employeeId, row.employeeName, row.date, row.type, row.hq, row.cluster, row.status,
    ])).sort();
    // DoneHai renders no table at all when a tab has no records.
    if (expected.length > 0) await expect(this.table).toBeVisible();
    await expect.poll(async () => normalize(await this.readRows()), {
      timeout: 30_000,
      message: 'Tour records must match the expected records for the selected tab',
    }).toEqual(normalize(expected));
    await expect(this.rows).toHaveCount(expected.length);
  }

  async openDatePicker() {
    await this.dateButton.click();
    await expect(this.dateButton).toHaveAttribute('aria-expanded', 'true');
    const dialogId = await this.dateButton.getAttribute('aria-controls');
    if (!dialogId) throw new Error('Date button has no aria-controls dialog reference.');
    // Resolve the current runtime ID instead of hardcoding Radix-generated IDs.
    const dialog = this.page.locator(`[id=${JSON.stringify(dialogId)}]`);
    await expect(dialog).toBeVisible();
    return dialog;
  }

  /**
   * Selects an inclusive range in the react-day-picker range calendar.
   * Click rules observed on DoneHai: a day after the start moves the end,
   * a day before the start moves the start, the current start is a no-op,
   * and the current end becomes a lone start.
   */
  async selectDateRange(from: string, to: string): Promise<void> {
    if (from >= to) throw new Error(`Range must span at least two days: ${from} – ${to}`);
    const dialog = await this.openDatePicker();

    const monthLabel = (iso: string) => {
      const [year, month] = iso.split('-').map(Number);
      return `${MONTH_NAMES[month - 1]} ${year}`;
    };
    const day = (iso: string) => dialog
      .getByRole('grid', { name: monthLabel(iso), exact: true })
      .locator('button[name="day"]:not(.day-outside)')
      .getByText(String(Number(iso.slice(8))), { exact: true });

    await this.showMonth(dialog, from);

    // Selected start/end as ISO dates, read from the calendar itself.
    const selection = async () => dialog.getByRole('grid').evaluateAll(grids => {
      const names = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      const dates = grids.flatMap(grid => {
        const label = document.getElementById(grid.getAttribute('aria-labelledby') ?? '')?.textContent?.trim() ?? '';
        const [name, year] = label.split(' ');
        const month = String(names.indexOf(name) + 1).padStart(2, '0');
        return Array.from(grid.querySelectorAll('button[name="day"][aria-selected="true"]:not(.day-outside)'))
          .map(button => `${year}-${month}-${button.textContent!.trim().padStart(2, '0')}`);
      }).sort();
      return { start: dates[0], end: dates.length > 1 ? dates.at(-1) : undefined };
    });

    let current = await selection();
    if (current.start !== from) {
      await day(from).click();
      current = await selection();
      if (current.start !== from) {
        // `from` was after the old start, so it became the end; clicking it again makes it the start.
        await day(from).click();
        await expect.poll(async () => (await selection()).start).toBe(from);
      }
    }

    if ((await selection()).end !== to) {
      await this.showMonth(dialog, to);
      await day(to).click();
    }

    await expect(this.dateButton,
      `Calendar did not select ${from} – ${to}.`
    ).toHaveText(new RegExp(`^${displayTourDate(from)}\\s*[–—-]\\s*${displayTourDate(to)}$`));

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
        g => document.getElementById(g.getAttribute('aria-labelledby') ?? '')?.textContent?.trim() ?? ''
      );
      const [name, shownYear] = first.split(' ');
      const shown = Number(shownYear) * 12 + MONTH_NAMES.indexOf(name);
      await dialog.getByRole('button', {
        name: year * 12 + month - 1 < shown ? 'Go to previous month' : 'Go to next month',
      }).click();
    }
    await expect(grid, `Calendar could not navigate to ${iso}.`).toBeVisible();
  }
}
