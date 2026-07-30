import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { TicketNotice } from "@/emails/shared/TicketNotice";

describe("TicketNotice", () => {
  it("renders the greeting, headline, ticket number, detail lines, and track link", async () => {
    const html = await render(
      createElement(TicketNotice, {
        firstName: "Maria",
        previewText: "Application received",
        headline: "Application received",
        intro: "We received your application.",
        ticketNo: "APP-2026-00001",
        detailLines: [{ label: "Purpose", value: "Barangay Clearance" }],
        trackHref: "/track?ticket=APP-2026-00001",
      }),
    );

    expect(html).toContain("Maria");
    expect(html).toContain("Application received");
    expect(html).toContain("APP-2026-00001");
    expect(html).toContain("Barangay Clearance");
    expect(html).toContain("/track?ticket=APP-2026-00001");
  });

  it("renders remarks under the given label when present, and omits the block when absent", async () => {
    const withRemarks = await render(
      createElement(TicketNotice, {
        firstName: "Maria",
        previewText: "Application update",
        headline: "Your application was not approved",
        intro: "We reviewed your application.",
        ticketNo: "APP-2026-00002",
        remarksLabel: "Reason",
        remarks: "Missing valid ID.",
        trackHref: "/track?ticket=APP-2026-00002",
      }),
    );
    expect(withRemarks).toContain("Reason");
    expect(withRemarks).toContain("Missing valid ID.");

    const withoutRemarks = await render(
      createElement(TicketNotice, {
        firstName: "Maria",
        previewText: "Application received",
        headline: "Application received",
        intro: "We received your application.",
        ticketNo: "APP-2026-00003",
        trackHref: "/track?ticket=APP-2026-00003",
      }),
    );
    expect(withoutRemarks).not.toContain("Reason");
  });
});
