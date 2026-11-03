import { chromium } from "@playwright/test";

/**
 * Launches a local headless browser for the helper scripts.
 * PW_CHANNEL=msedge|chrome uses an installed browser (no download);
 * without it, Playwright's own Chromium is used (npx playwright install chromium).
 */
export function launchBrowser(options = {}) {
  const channel = process.env.PW_CHANNEL || undefined;
  return chromium.launch({ headless: true, channel, ...options });
}
