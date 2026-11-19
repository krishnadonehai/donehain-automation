import type { Page } from '@playwright/test';

/** Stretch the headed Chromium window to the monitor. Headless has no window. */
export async function openFullWindow(page: Page): Promise<void> {
  const browser = page.context().browser();
  if (!browser || browser.browserType().name() !== 'chromium') return;
  try {
    const session = await page.context().newCDPSession(page);
    const { windowId } = await session.send('Browser.getWindowForTarget');
    await session.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'maximized' },
    });
    await session.detach();
  } catch {
    // Headless Chromium has no window bounds to change.
  }
}
