import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { ComplaintDismissedEmail } from "@/emails/ComplaintDismissedEmail";
import { ComplaintResolvedEmail } from "@/emails/ComplaintResolvedEmail";
import { ComplaintSubmittedEmail } from "@/emails/ComplaintSubmittedEmail";

describe("ComplaintSubmittedEmail", () => {
  it("includes the incident date and location", async () => {
    const html = await render(
      createElement(ComplaintSubmittedEmail, {
        firstName: "Maria",
        ticketNo: "CMP-2026-00001",
        incidentDate: "2026-07-20",
        location: "Purok 3",
      }),
    );

    expect(html).toContain("Purok 3");
    expect(html).toContain("CMP-2026-00001");
  });
});

describe("ComplaintResolvedEmail", () => {
  it("renders without remarks when none were given", async () => {
    const html = await render(
      createElement(ComplaintResolvedEmail, {
        firstName: "Maria",
        ticketNo: "CMP-2026-00001",
        remarks: null,
      }),
    );

    expect(html).toContain("resolved");
    expect(html).not.toContain("Notes:");
  });
});

describe("ComplaintDismissedEmail", () => {
  it("includes the reason under the Reason label", async () => {
    const html = await render(
      createElement(ComplaintDismissedEmail, {
        firstName: "Maria",
        ticketNo: "CMP-2026-00001",
        remarks: "Could not be substantiated.",
      }),
    );

    expect(html).toContain("Reason");
    expect(html).toContain("Could not be substantiated.");
  });
});
