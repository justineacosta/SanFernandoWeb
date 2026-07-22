import { describe, expect, it } from "vitest";
import { normaliseMobile } from "@/lib/public-forms";
import { inquirySchema } from "@/features/contact/schema";
import { INQUIRY_SUBJECTS, inquirySubjectLabel } from "@/features/contact/data";

/**
 * The /contact form and the alert signup were the two forms that claimed
 * success against no backend at all. These pin the rules the Server Actions now
 * enforce — and, for the mobile number, the normalisation the unique index on
 * `alert_subscribers.mobile` depends on to mean anything.
 */

const validInquiry = {
  firstName: "Juana",
  lastName: "Dela Cruz",
  email: "juana@example.com",
  phone: "",
  subject: "general",
  message: "I would like to ask about the requirements for a barangay clearance.",
  consent: true,
};

function messageFor(values: unknown, key: string): string | undefined {
  const result = inquirySchema.safeParse(values);
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === key)?.message;
}

describe("inquirySchema", () => {
  it("accepts a complete inquiry", () => {
    expect(inquirySchema.safeParse(validInquiry).success).toBe(true);
  });

  it("requires an email — it is the only way a reply gets back", () => {
    expect(messageFor({ ...validInquiry, email: "" }, "email")).toBe("Enter your email address.");
    expect(messageFor({ ...validInquiry, email: "juana@" }, "email")).toBe(
      "Enter a valid email address.",
    );
  });

  it("leaves the phone number optional", () => {
    expect(inquirySchema.safeParse({ ...validInquiry, phone: "" }).success).toBe(true);
    expect(inquirySchema.safeParse({ ...validInquiry, phone: "0917 555 0101" }).success).toBe(true);
  });

  it("rejects a subject that is not on the picker", () => {
    expect(messageFor({ ...validInquiry, subject: "anything-else" }, "subject")).toBe(
      "Choose a subject.",
    );
    for (const subject of INQUIRY_SUBJECTS) {
      expect(inquirySchema.safeParse({ ...validInquiry, subject: subject.value }).success).toBe(
        true,
      );
    }
  });

  it("wants a message with something in it, and caps how long", () => {
    expect(messageFor({ ...validInquiry, message: "hi" }, "message")).toBe(
      "Please tell us a little more so we can help.",
    );
    expect(messageFor({ ...validInquiry, message: "x".repeat(4001) }, "message")).toBe(
      "Please keep the message under 4000 characters.",
    );
  });

  it("will not submit without the privacy consent", () => {
    expect(messageFor({ ...validInquiry, consent: false }, "consent")).toBe(
      "Please agree to the data privacy notice.",
    );
  });
});

describe("inquirySubjectLabel", () => {
  it("resolves a stored value to its label", () => {
    expect(inquirySubjectLabel("documents")).toBe("Document Request");
  });

  it("falls back to the raw value so a renamed subject still shows something", () => {
    expect(inquirySubjectLabel("retired-subject")).toBe("retired-subject");
  });
});

describe("normaliseMobile", () => {
  it("collapses every way one number is written into a single stored form", () => {
    for (const input of [
      "09175550101",
      "0917 555 0101",
      "0917-555-0101",
      "+63 917 555 0101",
      "639175550101",
      "9175550101",
    ]) {
      expect(normaliseMobile(input)).toBe("09175550101");
    }
  });

  it("rejects anything that is not a Philippine mobile number", () => {
    // A landline, a number one digit short, one digit long, and empty.
    for (const input of ["(077) 600 1082", "0917555010", "091755501011", "", "not a number"]) {
      expect(normaliseMobile(input)).toBeNull();
    }
  });
});
