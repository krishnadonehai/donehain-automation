
import { expect, type Page } from '@playwright/test';

export class MonthlyAttendancePage {
  constructor(readonly page: Page) {}

  get monthlyRegisterLink() {
    return this.page.getByRole('link', {
      name: 'Monthly Register',
      exact: true,
    });
  }

  get exportPayrollButton() {
    return this.page.getByRole('button', {
      name: 'Export Payroll Excel',
      exact: true,
    });
  }

  get allManagersOption() {
    return this.page.getByRole('option', {
      name: 'All Managers',
      exact: true,
    });
  }

  async open(): Promise<void> {
    await this.page.goto('/attendance/monthly');

    await expect(this.page).toHaveURL(
      /\/attendance\/monthly\/?$/
    );

    await expect(this.exportPayrollButton).toBeVisible({
      timeout: 30000,
    });
  }

  async navigateFromDaily(): Promise<void> {
    await this.page.goto('/attendance');

    await this.monthlyRegisterLink.click();

    await expect(this.page).toHaveURL(
      /\/attendance\/monthly\/?$/
    );
  }
}
