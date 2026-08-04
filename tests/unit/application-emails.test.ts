import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { ApplicationApprovedEmail } from "@/emails/ApplicationApprovedEmail";
import { ApplicationRejectedEmail } from "@/emails/ApplicationRejectedEmail";
import { ApplicationSubmittedEmail } from "@/emails/ApplicationSubmittedEmail";

describe("ApplicationSubmittedEmail", () => {
  it("includes the resident's name, ticket number, document, purpose, and track link", async () => {
    const html = await render(
      createElement(ApplicationSubmittedEmail, {
        firstName: "Maria",
        ticketNo: "APP-2026-00001",
        serviceTitle: "Barangay Clearance",
        purpose: "Employment requirement",
      }),
    );

    expect(html).toContain("Maria");
    expect(html).toContain("APP-2026-00001");
    expect(html).toContain("Barangay Clearance");
    expect(html).toContain("Employment requirement");
    expect(html).toContain("/track?ticket=APP-2026-00001");
  });

  // purpose is optional since migration 0033. TicketNotice renders every detail
  // line it is handed, so an absent purpose has to be dropped by the template —
  // otherwise the receipt prints a bare "Purpose:" with nothing after it.
  it("omits the Purpose line entirely when no purpose was given", async () => {
    const html = await render(
      createElement(ApplicationSubmittedEmail, {
        firstName: "Maria",
        ticketNo: "APP-2026-00001",
        serviceTitle: "Barangay Clearance",
        purpose: null,
      }),
    );

    expect(html).not.toContain("Purpose");
    expect(html).toContain("Barangay Clearance");
    expect(html).toContain("APP-2026-00001");
  });
});

describe("ApplicationApprovedEmail", () => {
  it("tells the resident their document is ready to claim", async () => {
    const html = await render(
      createElement(ApplicationApprovedEmail, {
        firstName: "Maria",
        ticketNo: "APP-2026-00001",
        serviceTitle: "Barangay Clearance",
        requirements: ["Latest Community Tax Certificate (Cedula)", "Application fee: ₱50.00"],
      }),
    );

    expect(html).toContain("approved");
    expect(html).toContain("Barangay Clearance");
    expect(html).toContain("APP-2026-00001");
    expect(html).toContain("Latest Community Tax Certificate (Cedula)");
    expect(html).toContain("Application fee: ₱50.00");
  });
});

describe("ApplicationRejectedEmail", () => {
  it("includes the reason under the Reason label", async () => {
    const html = await render(
      createElement(ApplicationRejectedEmail, {
        firstName: "Maria",
        ticketNo: "APP-2026-00001",
        serviceTitle: "Barangay Clearance",
        remarks: "Missing valid ID.",
      }),
    );

    expect(html).toContain("Reason");
    expect(html).toContain("Missing valid ID.");
  });
});
