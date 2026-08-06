import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { InquiryAcknowledgedEmail } from "@/emails/InquiryAcknowledgedEmail";

describe("InquiryAcknowledgedEmail", () => {
  it("greets the resident by first name and includes their subject", async () => {
    const html = await render(
      createElement(InquiryAcknowledgedEmail, { firstName: "Maria", subject: "Barangay Clearance" }),
    );

    expect(html).toContain("Hi");
    expect(html).toContain("Maria");
    expect(html).toContain("Barangay Clearance");
    expect(html).toContain("24-48 business hours");
  });
});
