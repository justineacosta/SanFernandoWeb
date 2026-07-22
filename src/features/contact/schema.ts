import { z } from "zod";
import {
  consentField,
  firstNameField,
  lastNameField,
  requiredEmailField,
} from "@/lib/public-forms";
import { INQUIRY_SUBJECT_VALUES } from "./data";

/**
 * Shared by `actions.ts` (the authority) and `inquiry-form.tsx` (which uses it
 * to show the same message before the round trip). See `@/lib/public-forms` for
 * why this is not inside the action file.
 *
 * No address: a question does not need to know where someone lives. The email
 * is required rather than optional here — it is the only way an answer gets
 * back, and an inquiry no one can reply to is the problem this form had.
 */
export const inquirySchema = z.object({
  firstName: firstNameField,
  lastName: lastNameField,
  email: requiredEmailField,
  // Optional: someone who gave an email does not also owe us a number.
  phone: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.union([z.literal(""), z.string().max(30, "Phone number is too long.")]),
  ),
  // Validated against the list the form renders, not a free-text column: the
  // select is a picker, and anything else arriving here was not typed by a
  // resident.
  subject: z
    .string()
    .refine((value) => INQUIRY_SUBJECT_VALUES.includes(value), "Choose a subject."),
  message: z
    .string()
    .trim()
    .min(10, "Please tell us a little more so we can help.")
    .max(4000, "Please keep the message under 4000 characters."),
  consent: consentField,
});
