import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { TicketUpdateEmail } from "@/emails/TicketUpdateEmail";

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
