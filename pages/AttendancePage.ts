
import {
  expect,
  type Page,
  type Locator,
} from '@playwright/test';

import {
  displayDate,
  validateISODate,
  todayInIndia,
  daysBefore,
} from '../utils/dates';

export type AttendanceRecord = {
  id: string;
  name: string;
  designation: string;
  status: string;
};

export type AttendanceRow = AttendanceRecord & {
  date: string;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export class AttendancePage {
  constructor(readonly page: Page) {}

  get searchInput() {
    return this.page.getByPlaceholder(
      'Search name, department, or role...'
    );
  }

  get table() {
    return this.page.getByRole('table').filter({
      has: this.page.getByRole('columnheader', {
        name: 'EMP ID',
        exact: true,
      }),
    });
  }

  get dataRows() {
    return this.table.locator('tbody tr').filter({
      has: this.page.locator('td:nth-child(9)'),
    });
  }

 get dateButton() {
  return this.page
    .getByRole('button')
    .filter({
      hasText:
        /^\d{2}-[A-Za-z]{3}-\d{4}(?:\s*[–-]\s*\d{2}-[A-Za-z]{3}-\d{4})?$/,
    });
}

  get countHeading() {
    return this.page.getByRole('heading', {
      name: /^Attendance Records\s*\(/,
    });
  }

  get downloadReportButton() {
    return this.page.getByRole('button', {
      name: 'Download Report',
      exact: true,
    });
  }

  dropdownByText(value: string) {
    return this.page.getByRole('combobox').filter({
      has: this.page.getByText(value, {
        exact: true,
      }),
    });
  }

  async open(): Promise<void> {
    await this.page.goto('/attendance');

    await expect(this.searchInput).toBeVisible({
      timeout: 30000,
    });

    await expect(this.table).toBeVisible();
    await expect(this.dateButton).toBeVisible();
  }

  
async selectDate(isoDate: string): Promise<void> {
  validateISODate(isoDate);

  const expected = displayDate(isoDate);

  const trigger = this.dateButton;

  await expect(trigger).toBeVisible();

  const currentText = (await trigger.innerText()).trim();

  // Already selected as a single date.
  if (currentText === expected) {
    return;
  }

  await trigger.click();

  const dialog = this.page.getByRole('dialog');

  await expect(dialog).toBeVisible({
    timeout: 5000,
  });

  // Quick Select: Today / Yesterday
  const today = todayInIndia();
  const yesterday = daysBefore(today, 1);

  if (isoDate === today || isoDate === yesterday) {
    const option = isoDate === today
      ? 'Today'
      : 'Yesterday';

    await dialog.getByText(option, {
      exact: true,
    }).click();

    await expect(trigger).toHaveText(expected, {
      timeout: 15000,
    });

    return;
  }

  // Historical dates: select a one-day range in the
  // react-day-picker calendar (one role="grid" per visible month).
  const [year, month, day] =
    isoDate.split('-').map(Number);

  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;
  const monthGrid = dialog.getByRole('grid', {
    name: monthLabel,
    exact: true,
  });

  for (let step = 0; step < 36 && !(await monthGrid.isVisible()); step++) {
    const firstVisible = await dialog.getByRole('grid').first().evaluate(
      grid => document.getElementById(
        grid.getAttribute('aria-labelledby') ?? ''
      )?.textContent?.trim() ?? ''
    );
    const [shownName, shownYear] = firstVisible.split(' ');
    const shownIndex = Number(shownYear) * 12 +
      MONTH_NAMES.indexOf(shownName);
    const targetIndex = year * 12 + month - 1;

    await dialog.getByRole('button', {
      name: targetIndex < shownIndex
        ? 'Go to previous month'
        : 'Go to next month',
    }).click();
  }

  await expect(
    monthGrid,
    `Calendar could not navigate to ${monthLabel}.`
  ).toBeVisible();

  const calendarDay = monthGrid.getByRole('gridcell', {
    name: String(day),
    exact: true,
  });

  await calendarDay.click();

  // A range such as "13-Oct-2026 – 23-Oct-2026" also contains
  // the expected date, so only an exact match means one day is selected.
  // The range picker may need a second click to close the range.
  try {
    await expect(trigger).toHaveText(expected, { timeout: 3000 });
  } catch {
    if (await dialog.isVisible()) await calendarDay.click();
    await expect(
      trigger,
      `Expected a single-day selection of ${expected}.`
    ).toHaveText(expected, { timeout: 15000 });
  }

  if (await dialog.isVisible()) {
    await this.page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  }
}


  async searchEmployee(value: string): Promise<void> {
    await this.searchInput.fill(value);
  }

  async selectOption(
    current: string,
    next: string
  ): Promise<void> {
    await this.dropdownByText(current).click();

    const listbox =
      this.page.getByRole('listbox');

    await expect(listbox).toBeVisible();

    await listbox.getByRole('option', {
      name: next,
      exact: true,
    }).click();

    await expect(
      this.dropdownByText(next)
    ).toBeVisible();

    await expect(listbox).not.toBeVisible();
  }

  async readRows(): Promise<AttendanceRow[]> {
    return this.dataRows.evaluateAll(rows =>
      rows.map(row => {
        const cells = Array.from(
          row.querySelectorAll('td')
        ).map(cell =>
          cell.textContent?.trim() || ''
        );

        return {
          name: cells[0],
          id: cells[1],
          designation: cells[2],
          date: cells[3],
          status: cells[7],
        };
      })
    );
  }

  async expectRows(
    employees: AttendanceRecord[],
    isoDate: string
  ): Promise<void> {
    const expected = employees.map(employee => ({
      ...employee,
      date: displayDate(isoDate),
    })).sort((a, b) =>
      a.id.localeCompare(b.id)
    );

    await expect(this.dateButton).toHaveText(
      displayDate(isoDate)
    );

    await expect(this.countHeading).toHaveText(
      new RegExp(
        `^Attendance Records\\s*\\(\\s*${expected.length} of \\d+\\s*\\)$`
      )
    );

    await expect.poll(
      async () => {
        const rows = await this.readRows();

        return rows.sort((a, b) =>
          a.id.localeCompare(b.id)
        );
      },
      {
        timeout: 15000,
        message: 'Expected attendance records mismatch',
      }
    ).toEqual(expected);
  }

  async expectValidRows(
    isoDate: string
  ): Promise<void> {
    const expectedDate = displayDate(isoDate);

    await expect(this.dateButton).toHaveText(
      expectedDate
    );

    await expect.poll(async () => {
      const rows = await this.readRows();

      return rows.every(row =>
        row.id.length > 0 &&
        row.name.length > 0 &&
        row.date === expectedDate &&
        row.status.length > 0
      );
    }, {
      timeout: 15000,
    }).toBe(true);
  }
}
