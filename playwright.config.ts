import { defineConfig } from "@playwright/test";

// The e2e run uses its own ports, its own storage folder and a 5-second link
// lifetime, so the "expired link gives 403" check takes seconds, not minutes.
const APP = "http://localhost:3100";
const EDGE = "http://localhost:4101";
const shared = {
  STORAGE_DIR: ".local/e2e-storage",
  VIDEO_BASE_URL: EDGE,
  SIGNED_URL_TTL_SECONDS: "5",
};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: APP,
    // PW_CHANNEL=msedge (or chrome) uses an installed browser; otherwise Playwright's Chromium.
    channel: process.env.PW_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node scripts/setup.mjs && node scripts/e2e-prepare.mjs && node node_modules/tsx/dist/cli.mjs edge/server.ts",
      url: `${EDGE}/videos/health.webm`,
      // The edge answers 403 to an unsigned URL; any answer means it is up.
      ignoreHTTPSErrors: true,
      env: { ...shared, EDGE_PORT: "4101" },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "node node_modules/next/dist/bin/next start -p 3100",
      url: `${APP}/login`,
      env: { ...shared, NEXTAUTH_URL: APP },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
