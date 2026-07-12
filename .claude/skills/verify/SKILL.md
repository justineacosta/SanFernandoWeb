---
name: verify
description: Build/launch/drive recipe for verifying changes in this Next.js site at runtime
---

# Verifying changes in this repo

## Launch

- Dev server: `npm run dev` from repo root, serves http://localhost:3000. It is
  usually already running — check with
  `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` before starting another.
- `npm run typecheck` works; `npm run lint` is BROKEN repo-wide (Next 16 removed
  `next lint`, no ESLint config exists) — do not treat its failure as a change regression.
- No test framework exists. Runtime verification is the only check beyond typecheck.

## Drive (browser interactions)

No project Playwright install. Working recipe:

1. `npm i playwright-core` in the session scratchpad (1 package, fast).
2. Launch against the system Chrome:
   `chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true })`
   (Playwright's own chromium cache also exists at `$LOCALAPPDATA/ms-playwright`.)
3. `page.goto("http://localhost:3000/<route>", { waitUntil: "networkidle" })`, then
   drive with role-based locators and screenshot sections with `locator.screenshot()`.

## Gotchas

- Server components render full HTML (hidden rows included) — `curl` verifies SSR
  content/placement, but interactivity (clicks, aria-expanded flips) needs the
  Playwright recipe above.
- Mock content uses "Barangay Sampaguita" naming while the header brand says
  "Barangay San Fernando" — pre-existing inconsistency, not a regression signal.
