import { describe, expect, it } from "vitest";
import { applicationSchema } from "@/features/services/schema";
import { manilaToday } from "@/lib/format";

/**
 * The four field changes migration 0033 brought to the public apply form.
 * `applicationSchema` is the authority the Server Action re-validates with, so
 * these are the actual submission rules, not just the client's courtesy copy.
 */

const VALID = {
  firstName: "Juan",
  middleName: "Dizon",
  lastName: "Cruz",
  birthDate: "1990-05-04",
  address: "Sitio 1, Barangay San Fernando",
  contactNumber: "0917 000 0000",
  email: "",
  purpose: "Employment requirement",
  consent: true,
};

/** One year past today in Manila, as a YYYY-MM-DD string. */
function nextYear(): string {
  const [year, month, day] = manilaToday().split("-");
  return `${Number(year) + 1}-${month}-${day}`;
}

describe("applicationSchema — middleName", () => {
  it("accepts a middle name", () => {
    expect(applicationSchema.safeParse(VALID).success).toBe(true);
  });

  it("accepts a blank middle name — it is optional", () => {
    expect(applicationSchema.safeParse({ ...VALID, middleName: "" }).success).toBe(true);
  });

  it("rejects a middle name over 80 characters", () => {
    const result = applicationSchema.safeParse({ ...VALID, middleName: "a".repeat(81) });
    expect(result.success).toBe(false);
  });
});

describe("applicationSchema — birthDate", () => {
  it("accepts a past date", () => {
    expect(applicationSchema.safeParse({ ...VALID, birthDate: "1990-05-04" }).success).toBe(true);
  });

  it("rejects a blank birth date — it is required", () => {
    expect(applicationSchema.safeParse({ ...VALID, birthDate: "" }).success).toBe(false);
  });

  it("rejects a date in the future", () => {
    expect(applicationSchema.safeParse({ ...VALID, birthDate: nextYear() }).success).toBe(false);
  });

  it("rejects a date before 1900", () => {
    expect(applicationSchema.safeParse({ ...VALID, birthDate: "1899-12-31" }).success).toBe(false);
  });

  it("rejects a non-ISO date shape", () => {
    expect(applicationSchema.safeParse({ ...VALID, birthDate: "04/05/1990" }).success).toBe(false);
  });
});

describe("applicationSchema — purpose", () => {
  it("accepts a blank purpose — optional since 0033", () => {
    expect(applicationSchema.safeParse({ ...VALID, purpose: "" }).success).toBe(true);
  });

  it("still rejects a purpose over 500 characters", () => {
    // The cap stays: this is an unauthenticated endpoint writing to an
    // unconstrained text column. Only the minimum was dropped.
    expect(applicationSchema.safeParse({ ...VALID, purpose: "a".repeat(501) }).success).toBe(false);
  });
});
