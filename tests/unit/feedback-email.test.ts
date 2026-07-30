import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { FeedbackStaffNotifyEmail } from "@/emails/FeedbackStaffNotifyEmail";

describe("FeedbackStaffNotifyEmail", () => {
  it("includes the category, subject, message, and a link to the specific feedback report", async () => {
    const html = await render(
      createElement(FeedbackStaffNotifyEmail, {
        category: "Bug Report",
        subject: "Broken image on /about",
        message: "The captain's photo does not load.",
        feedbackId: "fb-123",
      }),
    );

    expect(html).toContain("Bug Report");
    expect(html).toContain("Broken image on /about");
    expect(html).toContain("The captain&#x27;s photo does not load.");
    expect(html).toContain("/admin/inquiries?tab=feedback&amp;review=fb-123");
  });
});
