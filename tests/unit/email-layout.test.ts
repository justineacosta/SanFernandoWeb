import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { EmailLayout } from "@/emails/EmailLayout";

describe("EmailLayout", () => {
  it("wraps its children and renders the barangay name, address, and phone", async () => {
    const html = await render(
      createElement(
        EmailLayout,
        { previewText: "Test preview" },
        createElement("p", null, "Hello resident"),
      ),
    );

    expect(html).toContain("Barangay San Fernando");
    expect(html).toContain("Hello resident");
    expect(html).toContain("(077) 600 1082");
  });
});
