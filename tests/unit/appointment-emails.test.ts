import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { AppointmentConfirmedEmail } from "@/emails/AppointmentConfirmedEmail";
import { AppointmentDeclinedEmail } from "@/emails/AppointmentDeclinedEmail";
import { AppointmentSubmittedEmail } from "@/emails/AppointmentSubmittedEmail";

describe("AppointmentSubmittedEmail", () => {
  it("includes the purpose and the requested schedule with a period label", async () => {
    const html = await render(
      createElement(AppointmentSubmittedEmail, {
        firstName: "Maria",
        ticketNo: "APT-2026-00001",
        purpose: "Renew business permit",
        preferredDate: "2026-08-15",
        preferredPeriod: "am",
      }),
    );

    expect(html).toContain("Renew business permit");
    expect(html).toContain("Morning (8:00 AM");
    expect(html).toContain("APT-2026-00001");
  });
});

describe("AppointmentConfirmedEmail", () => {
  it("includes the confirmed schedule", async () => {
    const html = await render(
      createElement(AppointmentConfirmedEmail, {
        firstName: "Maria",
        ticketNo: "APT-2026-00001",
        confirmedDate: "2026-08-16",
        confirmedPeriod: "pm",
      }),
    );

    expect(html).toContain("confirmed");
    expect(html).toContain("Afternoon (1:00 PM");
  });
});

describe("AppointmentDeclinedEmail", () => {
  it("includes the reason under the Reason label", async () => {
    const html = await render(
      createElement(AppointmentDeclinedEmail, {
        firstName: "Maria",
        ticketNo: "APT-2026-00001",
        remarks: "Fully booked that week.",
      }),
    );

    expect(html).toContain("Reason");
    expect(html).toContain("Fully booked that week.");
  });
});
