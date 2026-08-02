import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { AccountInviteEmail } from "@/emails/AccountInviteEmail";

describe("AccountInviteEmail", () => {
  it("includes the recipient's name and the set-password link", async () => {
    const html = await render(
      createElement(AccountInviteEmail, {
        fullName: "Juan Dela Cruz",
        setPasswordUrl: "https://example.com/admin/reset-password?token_hash=abc123",
      }),
    );

    expect(html).toContain("Juan Dela Cruz");
    expect(html).toContain("https://example.com/admin/reset-password?token_hash=abc123");
    expect(html).toContain("Set your password");
  });
});
