import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { TicketUpdateEmail } from "@/emails/TicketUpdateEmail";
import { TicketReplyStaffNotifyEmail } from "@/emails/TicketReplyStaffNotifyEmail";

describe("TicketUpdateEmail", () => {
  it("renders a plain update with the staff body and a track link", async () => {
    const html = await render(
      createElement(TicketUpdateEmail, {
        firstName: "Maria",
        ticketNo: "APP-2026-00001",
        kindLabel: "certificate application",
        body: "Your document is being printed.",
        needsInfo: false,
      }),
    );
    expect(html).toContain("Maria");
    expect(html).toContain("APP-2026-00001");
    expect(html).toContain("Your document is being printed.");
    expect(html).toContain("/track?ticket=APP-2026-00001");
    expect(html).toContain("Track this ticket");
  });

  it("switches headline and button copy when information is needed", async () => {
    const html = await render(
      createElement(TicketUpdateEmail, {
        firstName: "Jose",
        ticketNo: "AST-2026-00007",
        kindLabel: "assistance request",
        body: "Please send a photo of your barangay ID.",
        needsInfo: true,
      }),
    );
    expect(html).toContain("Send the information");
    expect(html).toContain("Please send a photo of your barangay ID.");
    expect(html).not.toContain("Track this ticket");
  });
});

describe("TicketReplyStaffNotifyEmail", () => {
  it("names the ticket and the attachment count, and links to the admin queue", async () => {
    const html = await render(
      createElement(TicketReplyStaffNotifyEmail, {
        ticketNo: "CMP-2026-00003",
        kindLabel: "incident report",
        attachmentCount: 2,
        adminHref: "/admin/complaints?review=abc-123",
      }),
    );
    expect(html).toContain("CMP-2026-00003");
    expect(html).toContain("2");
    expect(html).toContain("/admin/complaints?review=abc-123");
  });

  it("never echoes the reply body — a complaint reply can carry incident detail", async () => {
    const html = await render(
      createElement(TicketReplyStaffNotifyEmail, {
        ticketNo: "CMP-2026-00004",
        kindLabel: "incident report",
        attachmentCount: 0,
        adminHref: "/admin/complaints?review=def-456",
      }),
    );
    // The component takes no `body` prop at all — this asserts the shape, not a filter.
    expect(html).not.toContain("undefined");
  });
});
