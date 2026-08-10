import { describe, expect, it } from "vitest";
import { serviceHref } from "@/features/services/flow";

describe("serviceHref", () => {
  it("routes an apply flow to the service's own apply page", () => {
    expect(serviceHref({ id: "barangay-clearance", flow: "apply" })).toBe(
      "/services/apply/barangay-clearance",
    );
  });

  it("routes a complaint flow to the complaint form", () => {
    // The id is deliberately ignored here: there is one complaint form, not
    // one per service row.
    expect(serviceHref({ id: "blotter-complaints", flow: "complaint" })).toBe("/complaints/new");
  });

  it("routes an assistance flow to the assistance form", () => {
    expect(serviceHref({ id: "social-services-assistance", flow: "assistance" })).toBe(
      "/assistance/new",
    );
  });

  it("routes an appointment flow to the appointment form", () => {
    expect(serviceHref({ id: "set-an-appointment", flow: "appointment" })).toBe(
      "/appointments/new",
    );
  });
});
