import { z } from "zod";
import { consentField, residentFields } from "@/lib/public-forms";
import { manilaToday } from "@/lib/format";

/**
 * Shared by `actions.ts` (the authority) and `complaint-form.tsx` (which uses
 * it to show the same message before the round trip). See `@/lib/public-forms`
 * for why this is not inside the action file.
 */
export const complaintSchema = z.object({
  ...residentFields,
  // Optional: a resident may report an incident without naming anyone.
  respondent: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.union([z.literal(""), z.string().max(120, "That name is too long.")]),
  ),
  incidentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date the incident happened.")
    .refine((value) => value <= manilaToday(), "The incident date cannot be in the future.")
    .refine((value) => value >= "1900-01-01", "Enter the date the incident happened."),
  location: z
    .string()
    .trim()
    .min(4, "Where did this happen?")
    .max(200, "Please keep the location short."),
  // The narrative is the one field allowed to be long — it is the point of the
  // record — but it is still capped.
  narrative: z
    .string()
    .trim()
    .min(20, "Please describe what happened in a little more detail.")
    .max(4000, "Please keep the account under 4000 characters."),
  consent: consentField,
});
