import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above regular `const` declarations, so the
// mock function itself must be created inside vi.hoisted() — referencing a
// plain top-level `const sendMock = vi.fn()` here would throw a
// temporal-dead-zone error at module load.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function () {
    return {
      emails: { send: sendMock },
    };
  }),
}));

describe("sendEmail", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    process.env = { ...originalEnv };
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("skips sending in development when the API key is unset, warning once", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sendEmail } = await import("@/lib/email");

    const result = await sendEmail({
      to: "resident@example.com",
      subject: "Hi",
      template: {} as never,
    });

    expect(result).toEqual({ ok: false });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not throw in production when the API key is unset, logging an error every call", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendEmail } = await import("@/lib/email");

    await sendEmail({ to: "resident@example.com", subject: "Hi", template: {} as never });
    const result = await sendEmail({ to: "resident@example.com", subject: "Hi", template: {} as never });

    expect(result).toEqual({ ok: false });
    expect(error).toHaveBeenCalledTimes(2);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends through Resend and returns the id when configured", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "Barangay San Fernando <test@example.com>";
    sendMock.mockResolvedValue({ data: { id: "email_123" }, error: null });
    const { sendEmail } = await import("@/lib/email");

    const result = await sendEmail({
      to: "resident@example.com",
      subject: "Hi",
      template: {} as never,
    });

    expect(result).toEqual({ ok: true, id: "email_123" });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "resident@example.com",
        subject: "Hi",
        from: "Barangay San Fernando <test@example.com>",
      }),
    );
  });

  it("fails open when Resend reports an error", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "Barangay San Fernando <test@example.com>";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    sendMock.mockResolvedValue({ data: null, error: { message: "invalid recipient" } });
    const { sendEmail } = await import("@/lib/email");

    const result = await sendEmail({ to: "bad", subject: "Hi", template: {} as never });

    expect(result).toEqual({ ok: false });
    expect(error).toHaveBeenCalled();
  });

  it("fails open when the send call itself throws", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "Barangay San Fernando <test@example.com>";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    sendMock.mockRejectedValue(new Error("network down"));
    const { sendEmail } = await import("@/lib/email");

    const result = await sendEmail({
      to: "resident@example.com",
      subject: "Hi",
      template: {} as never,
    });

    expect(result).toEqual({ ok: false });
    expect(error).toHaveBeenCalled();
  });
});
