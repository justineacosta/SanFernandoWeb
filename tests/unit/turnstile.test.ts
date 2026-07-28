import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * verifyTurnstileToken (security-hardening Plan 2).
 *
 * Missing-key behaviour is asymmetric on purpose: development skips
 * verification with a warning (no Cloudflare account required to run
 * `npm run dev`), production throws (a misconfigured deploy must fail loudly,
 * not silently ship with no CAPTCHA). A present secret with no token is
 * always a rejection, in every environment — there is nothing to verify.
 */
describe("verifyTurnstileToken", () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("skips verification in development when the secret is unset", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { verifyTurnstileToken } = await import("@/lib/turnstile");
    await expect(verifyTurnstileToken(null, "1.2.3.4")).resolves.toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it("throws in production when the secret is unset", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { verifyTurnstileToken } = await import("@/lib/turnstile");
    await expect(verifyTurnstileToken("some-token", "1.2.3.4")).rejects.toThrow();
  });

  it("rejects a missing token when a secret is configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const { verifyTurnstileToken } = await import("@/lib/turnstile");
    await expect(verifyTurnstileToken(null, "1.2.3.4")).resolves.toBe(false);
  });

  it("returns true when Cloudflare reports success", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: true }),
    }) as unknown as typeof fetch;
    const { verifyTurnstileToken } = await import("@/lib/turnstile");
    await expect(verifyTurnstileToken("real-token", "1.2.3.4")).resolves.toBe(true);
  });

  it("returns false when Cloudflare reports failure", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: false }),
    }) as unknown as typeof fetch;
    const { verifyTurnstileToken } = await import("@/lib/turnstile");
    await expect(verifyTurnstileToken("bad-token", "1.2.3.4")).resolves.toBe(false);
  });

  it("fails closed when the verification request itself errors", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    const { verifyTurnstileToken } = await import("@/lib/turnstile");
    await expect(verifyTurnstileToken("real-token", "1.2.3.4")).resolves.toBe(false);
  });
});
