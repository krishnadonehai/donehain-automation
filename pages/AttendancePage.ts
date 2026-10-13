import { expect, type Page } from '@playwright/test';

export type AttendanceRecord = {
  id: string; name: string; designation: string; status: string;
};

export function displayDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== iso) throw new Error('Invalid attendance.json date.');
  return `${String(day).padStart(2, '0')}-${months[month - 1]}-${year}`;
}

export class AttendancePage {
  constructor(readonly page: Page) {}
  get searchInput() { return this.page.getByPlaceholder('Search name, department, or role...'); }
  get table() {
    return this.page.getByRole('table').filter({
      has: this.page.getByRole('columnheader', { name: 'EMP ID', exact: true }),
    });
  }
  get dataRows() {
    return this.table.locator('tbody tr').filter({ has: this.page.locator('td:nth-child(9)') });
  }
  get dateButton() { return this.page.getByRole('button', { name: /^\d{2}-[A-Za-z]{3}-\d{4}$/ }); }
  get countHeading() { return this.page.getByRole('heading', { name: /^Attendance Records \(/ }); }
  get downloadReportButton() { return this.page.getByRole('button', { name: 'Download Report', exact: true }); }

  dropdownByText(value: string) {
    return this.page.getByRole('combobox').filter({ has: this.page.getByText(value, { exact: true }) });
  }

  async open(): Promise<void> {
    await this.page.goto('/attendance');
    await expect(this.searchInput).toBeVisible({ timeout: 30_000 });
    await expect(this.table).toBeVisible();
  }

  async searchEmployee(value: string): Promise<void> { await this.searchInput.fill(value); }

  async selectOption(current: string, next: string): Promise<void> {
    await this.dropdownByText(current).click();
    const listbox = this.page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await listbox.getByRole('option', { name: next, exact: true }).click();
    await expect(this.dropdownByText(next)).toBeVisible();
    await expect(listbox).not.toBeVisible();
  }

  async readRows() {
    return this.dataRows.evaluateAll(rows => rows.map(row => {
      const cells = Array.from(row.querySelectorAll('td')).map(cell => cell.textContent?.trim() || '');
      return { id: cells[1], name: cells[0], designation: cells[2], date: cells[3], status: cells[7] };
    }));
  }

  async expectRows(employees: AttendanceRecord[], isoDate: string): Promise<void> {
    const expected = employees.map(employee => ({ ...employee, date: displayDate(isoDate) }))
      .sort((a, b) => a.id.localeCompare(b.id));
    await expect(this.dateButton, 'Selected date must match data/attendance.json. Update approved test data when needed.')
      .toHaveText(displayDate(isoDate));
    await expect(this.countHeading).toHaveText(
      new RegExp(`^Attendance Records \\(\\s*${expected.length} of \\d+\\s*\\)$`)
    );
    await expect.poll(async () => (await this.readRows()).sort((a, b) => a.id.localeCompare(b.id)), {
      timeout: 30_000,
      message: 'Attendance rows must match the expected test dataset',
    }).toEqual(expected);
  }
}
