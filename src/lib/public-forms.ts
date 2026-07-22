import { z } from "zod";

/**
 * Field schemas shared by the four public ticket forms.
 *
 * These lived inside the `"use server"` action files, which may only export
 * async functions — so no client component could import them, which is exactly
 * why the forms had no inline validation and every mistake cost a round trip.
 * They live here instead, imported by both the action and the form, so the
 * message a resident sees before submitting is the same string the server would
 * have sent back. The two cannot drift, because there is one definition.
 *
 * The server still validates. Server Actions are public HTTP endpoints and
 * remain the authority; the client copy is a courtesy, not a gate.
 *
 * Upper bounds matter here in a way they don't on the admin forms: these are
 * unauthenticated endpoints writing to unconstrained `text` columns, so every
 * free-text field is capped at a length a real resident would never exceed.
 */

export const firstNameField = z
  .string()
  .trim()
  .min(2, "Enter your first name.")
  .max(80, "First name is too long.");

export const lastNameField = z
  .string()
  .trim()
  .min(2, "Enter your last name.")
  .max(80, "Last name is too long.");

export const addressField = z
  .string()
  .trim()
  .min(4, "Enter your purok or street address.")
  .max(200, "Address is too long.");

export const contactNumberField = z
  .string()
  .trim()
  .min(7, "Enter a contact number we can reach you on.")
  .max(30, "Contact number is too long.")
  // Digits anywhere, not consecutively: "(077) 600-0000" is the local shape.
  .refine(
    (value) => (value.match(/\d/g) ?? []).length >= 7,
    "Enter a contact number we can reach you on.",
  );

/** Optional. Whitespace-only means "not given", same as empty. */
export const optionalEmailField = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.union([
    z.literal(""),
    z.string().email("Enter a valid email address.").max(254, "Email address is too long."),
  ]),
);

export const consentField = z
  .boolean()
  .refine((value) => value === true, "Please agree to the data privacy notice.");

/** The identity block every public ticket form opens with. */
export const residentFields = {
  firstName: firstNameField,
  lastName: lastNameField,
  address: addressField,
  contactNumber: contactNumberField,
  email: optionalEmailField,
} as const;

/**
 * First message per field, keyed by field name.
 *
 * First and not all: a field showing three complaints at once is noise, and the
 * first failing rule is the one the resident has to fix before the next is even
 * reachable.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in result)) {
      result[key] = issue.message;
    }
  }
  return result;
}
