import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { InquiryAcknowledgedEmail } from "@/emails/InquiryAcknowledgedEmail";
import { InquiryStaffNotifyEmail } from "@/emails/InquiryStaffNotifyEmail";

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

describe("InquiryStaffNotifyEmail", () => {
  it("includes the sender, subject, message, and a link to the specific inquiry", async () => {
    const html = await render(
      createElement(InquiryStaffNotifyEmail, {
        fullName: "Maria Santos",
        subject: "Barangay Clearance",
        message: "How do I request one?",
        inquiryId: "abc-123",
      }),
    );

    expect(html).toContain("Maria Santos");
    expect(html).toContain("Barangay Clearance");
    expect(html).toContain("How do I request one?");
    expect(html).toContain("/admin/inquiries?review=abc-123");
  });
});
