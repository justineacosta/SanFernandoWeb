import { z } from "zod";
import { consentField, residentFields } from "@/lib/public-forms";
import { manilaToday } from "@/lib/format";

/**
 * Shared by `actions.ts` and `apply-form.tsx`. See `@/lib/public-forms`.
 *
 * `middleName` and `birthDate` are applications-only (migration 0033) and so
 * live here rather than in `residentFields`, whose whole contract is "the
 * identity block every public ticket form opens with" — the other three flows
 * do not collect either field.
 */
export const applicationSchema = z.object({
  ...residentFields,
  // Optional. "" means not given, and the action stores null rather than "".
  middleName: z.string().trim().max(80, "Middle name is too long."),
  // Modelled on `complaintSchema.incidentDate`: both bounds are lexicographic
  // comparisons on zero-padded YYYY-MM-DD, never a parsed Date.
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth.")
    .refine((value) => value <= manilaToday(), "Your date of birth cannot be in the future.")
    .refine((value) => value >= "1900-01-01", "Enter your date of birth."),
  // Optional since 0033. The 500 cap stays — this is an unauthenticated endpoint
  // writing to an unconstrained text column — but the floor was a policy choice
  // and it is the part being reversed.
  purpose: z.string().trim().max(500, "Please keep the purpose short."),
  consent: consentField,
});
