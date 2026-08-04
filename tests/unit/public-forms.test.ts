import { describe, expect, it } from "vitest";
import { fieldErrors } from "@/lib/public-forms";
import { applicationSchema } from "@/features/services/schema";
import { appointmentSchema } from "@/features/appointments/schema";
import { assistanceSchema } from "@/features/assistance/schema";
import { complaintSchema } from "@/features/complaints/schema";

/**
 * These schemas moved out of their `"use server"` files so the forms could
 * import them. The move must not have changed what the SERVER accepts — these
 * cases pin the rules and the exact resident-facing messages, which are now
 * shown in two places and so have two ways to go wrong.
 */

const resident = {
  firstName: "Juan",
  lastName: "Dela Cruz",
  address: "Sitio 3, San Fernando",
  contactNumber: "0917 555 0101",
  email: "",
};

/** Far enough out to be valid today and for the next several years. */
const FUTURE_DATE = `${new Date().getFullYear() + 1}-06-15`;

// Applications alone carry middleName/birthDate (migration 0033); they are not
// part of the shared `resident` block the other three flows spread.
const validApplication = {
  ...resident,
  middleName: "Dizon",
  birthDate: "1990-05-04",
  purpose: "Barangay clearance for work",
  consent: true,
};
const validAppointment = {
  ...resident,
  purpose: "Discuss a permit",
  preferredDate: FUTURE_DATE,
  preferredPeriod: "am",
  consent: true,
};
const validAssistance = {
  ...resident,
  categoryId: "medical",
  details: "I need help with hospital bills for my mother this month.",
  consent: true,
};
const validComplaint = {
  ...resident,
  respondent: "",
  incidentDate: "2026-07-01",
  location: "Corner of Sitio 3",
  narrative: "Loud videoke past midnight on three separate nights this week.",
  consent: true,
};

/** The first message for `key`, or undefined if that field passed. */
function messageFor(schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } }, values: unknown, key: string) {
  const result = schema.safeParse(values);
  if (result.success) return undefined;
  return fieldErrors(result.error as Parameters<typeof fieldErrors>[0])[key];
}

describe("the four public form schemas accept a well-filled form", () => {
  it.each([
    ["application", applicationSchema, validApplication],
    ["appointment", appointmentSchema, validAppointment],
    ["assistance", assistanceSchema, validAssistance],
    ["complaint", complaintSchema, validComplaint],
  ])("%s", (_name, schema, values) => {
    expect(schema.safeParse(values).success).toBe(true);
  });
});

describe("the shared resident fields", () => {
  it("asks for a first and last name", () => {
    expect(messageFor(applicationSchema, { ...validApplication, firstName: "J" }, "firstName")).toBe(
      "Enter your first name.",
    );
    expect(messageFor(applicationSchema, { ...validApplication, lastName: "" }, "lastName")).toBe(
      "Enter your last name.",
    );
  });

  it("counts digits anywhere in the contact number, not consecutively", () => {
    // "(077) 600-1082" is the local shape and must pass.
    expect(
      applicationSchema.safeParse({ ...validApplication, contactNumber: "(077) 600-1082" }).success,
    ).toBe(true);
    expect(
      messageFor(applicationSchema, { ...validApplication, contactNumber: "0917-55" }, "contactNumber"),
    ).toBe("Enter a contact number we can reach you on.");
  });

  it("treats a blank or whitespace-only email as not given", () => {
    expect(applicationSchema.safeParse({ ...validApplication, email: "" }).success).toBe(true);
    expect(applicationSchema.safeParse({ ...validApplication, email: "   " }).success).toBe(true);
    expect(messageFor(applicationSchema, { ...validApplication, email: "juan@" }, "email")).toBe(
      "Enter a valid email address.",
    );
  });

  it("caps free text, because these columns are unconstrained and unauthenticated", () => {
    expect(messageFor(applicationSchema, { ...validApplication, address: "x".repeat(201) }, "address")).toBe(
      "Address is too long.",
    );
    expect(messageFor(complaintSchema, { ...validComplaint, narrative: "x".repeat(4001) }, "narrative")).toBe(
      "Please keep the account under 4000 characters.",
    );
  });

  it("requires the privacy consent on every form", () => {
    for (const [schema, values] of [
      [applicationSchema, validApplication],
      [appointmentSchema, validAppointment],
      [assistanceSchema, validAssistance],
      [complaintSchema, validComplaint],
    ] as const) {
      expect(messageFor(schema, { ...values, consent: false }, "consent")).toBe(
        "Please agree to the data privacy notice.",
      );
    }
  });
});

describe("the per-form rules", () => {
  it("refuses an appointment in the past and one more than a year out", () => {
    expect(
      messageFor(appointmentSchema, { ...validAppointment, preferredDate: "2020-01-01" }, "preferredDate"),
    ).toBe("Pick a date that has not passed.");
    expect(
      messageFor(
        appointmentSchema,
        { ...validAppointment, preferredDate: `${new Date().getFullYear() + 5}-01-01` },
        "preferredDate",
      ),
    ).toBe("Please pick a date within the next year.");
  });

  it("refuses an incident dated in the future — the mirror of the appointment rule", () => {
    expect(
      messageFor(complaintSchema, { ...validComplaint, incidentDate: FUTURE_DATE }, "incidentDate"),
    ).toBe("The incident date cannot be in the future.");
  });

  it("lets a complaint name nobody", () => {
    expect(complaintSchema.safeParse({ ...validComplaint, respondent: "" }).success).toBe(true);
  });

  it("asks assistance requests for a category and enough detail", () => {
    expect(messageFor(assistanceSchema, { ...validAssistance, categoryId: "" }, "categoryId")).toBe(
      "Pick the kind of assistance you need.",
    );
    expect(messageFor(assistanceSchema, { ...validAssistance, details: "help" }, "details")).toBe(
      "Please tell us a little more about what you need.",
    );
  });
});

describe("fieldErrors", () => {
  it("keeps the first message per field and drops the rest", () => {
    const result = applicationSchema.safeParse({ ...validApplication, firstName: "", lastName: "" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = fieldErrors(result.error);
    expect(Object.keys(errors).sort()).toEqual(["firstName", "lastName"]);
    expect(errors.firstName).toBe("Enter your first name.");
  });
});
