import { defineConfig } from "vitest/config";

/**
 * Unit tests only — pure functions, no DOM.
 *
 * Everything under `tests/unit` imports a module that takes data and returns
 * data. There is deliberately no jsdom and no React renderer here: component
 * behaviour is covered by Playwright against the real app, where a mistake in
 * the test environment cannot make a broken page look green.
 */
export default defineConfig({
  // Resolves the `@/*` alias straight from tsconfig.json.
  resolve: { tsconfigPaths: true },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
