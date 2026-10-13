import { expect, type Page } from '@playwright/test';

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
    return this.page.locator('button[aria-haspopup="dialog"]').filter({
      hasText: /\d{2}-[A-Za-z]{3}-\d{4}\s*[–—-]\s*\d{2}-[A-Za-z]{3}-\d{4}/,
    });
  }

  get exportButton() {
    return this.page.getByRole('button', { name: 'Export', exact: true });
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
    await this.tab(status).click();
    await expect(this.tab(status)).toHaveAttribute('aria-selected', 'true');
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
    await expect(this.table).toBeVisible();
    await expect.poll(async () => normalize(await this.readRows()), {
      timeout: 30_000,
      message: 'Tour records must match the supplied fixture for the selected tab',
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
}
