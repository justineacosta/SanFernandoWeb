import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

/**
 * Next loads `.env.local` for the app, but this config runs in a plain Node
 * process that never sees it — so the e2e credentials are read here directly.
 * Existing environment variables win, which is how CI supplies secrets.
 */
function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
}
loadEnvLocal();

/**
 * End-to-end tests against a real dev server.
 *
 * Chrome is used via `channel: "chrome"` (the system install) rather than
 * Playwright's own download, matching how this repo has been verified all
 * along — see `.claude/skills/verify/SKILL.md`.
 *
 * Two projects with different auth needs:
 *   - `public` visits pages that require no session.
 *   - `admin` reuses a storage state produced once by `auth.setup.ts`, so the
 *     suite signs in a single time instead of once per test.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "public",
      testMatch: /public[\\/].*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "admin",
      testMatch: /admin[\\/].*\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        storageState: "tests/e2e/.auth/admin.json",
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
