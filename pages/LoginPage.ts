import { expect, type Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}
  get identifierInput() { return this.page.locator('#identifier'); }
  get continueButton() { return this.page.getByRole('button', { name: 'Continue', exact: true }); }
  get otpInput() { return this.page.locator('#otp'); }
  get signInButton() { return this.page.getByRole('button', { name: 'Sign in', exact: true }); }

  async open(): Promise<void> {
    await this.page.goto('/login');
    await expect(this.identifierInput).toBeVisible();
  }
  async requestOtp(identifier: string): Promise<void> {
    await this.identifierInput.fill(identifier);
    await this.continueButton.click();
    await expect(this.otpInput).toBeVisible({ timeout: 30_000 });
  }
  async signIn(otp: string): Promise<void> {
    await this.otpInput.fill(otp);
    await expect(this.signInButton).toBeEnabled();
    await this.signInButton.click();
  }
}
