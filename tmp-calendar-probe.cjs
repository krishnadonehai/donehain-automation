require('dotenv/config');
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: process.env.BASE_URL, viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  await page.goto('/login');
  await page.locator('#identifier').fill(process.env.TEST_IDENTIFIER);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('#otp').fill(process.env.TEST_OTP);
  const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
  await signIn.waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Sign in' && !b.disabled));
  await signIn.click();
  await page.waitForURL(/\/dashboard/, { timeout: 30000 }).catch(async e => {
    console.log('URL:', page.url());
    console.log((await page.locator('body').innerText()).slice(0, 800));
    throw e;
  });
  await page.goto('/attendance');
  await page.getByPlaceholder('Search name, department, or role...').waitFor({ timeout: 30000 });
  const trigger = page.getByRole('button').filter({ hasText: /^\d{2}-[A-Za-z]{3}-\d{4}/ });
  console.log('TRIGGER TEXT:', await trigger.innerText());
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  const day13 = dialog.getByRole('grid', { name: 'October 2026' }).locator('button[name="day"]:not(.day-outside)', { hasText: /^13$/ });
  const day23 = dialog.getByRole('grid', { name: 'October 2026' }).locator('button[name="day"]:not(.day-outside)', { hasText: /^23$/ });
  console.log('day13 count', await day13.count());
  const state = async () => (await dialog.isVisible())
    ? JSON.stringify(await dialog.locator('button[name="day"][aria-selected="true"]').evaluateAll(b => b.map(x => x.textContent + ':' + (x.className.match(/day-range-\w+/g) || []).join('/'))))
    : 'closed';
  console.log('initial selected:', await state());
  const steps = [['23', day23], ['13', day13], ['13', day13], ['13', day13]];
  for (let i = 1; i <= steps.length; i++) {
    if (!(await dialog.isVisible())) { console.log('dialog closed, reopening'); await trigger.click(); await dialog.waitFor(); console.log('  reopened selected:', await state()); }
    console.log('clicking', steps[i - 1][0]);
    await steps[i - 1][1].click();
    await page.waitForTimeout(1500);
    console.log(`after click ${i}: trigger="${await trigger.innerText()}" selected=${await state()}`);
  }
  await dialog.getByRole('button', { name: 'Go to previous month' }).click();
  console.log('after prev:', await dialog.getByRole('grid').evaluateAll(g => g.map(x => x.getAttribute('aria-label'))));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
