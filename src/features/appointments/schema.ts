import { z } from "zod";
import { consentField, residentFields } from "@/lib/public-forms";
import { manilaToday, manilaTodayNextYear } from "@/lib/format";
import { isClosedDay } from "@/lib/office-days";

/** Shared by `actions.ts` and `appointment-form.tsx`. See `@/lib/public-forms`. */
export const appointmentSchema = z.object({
  ...residentFields,
  purpose: z
    .string()
    .trim()
    .min(4, "Tell us what the appointment is about.")
    .max(500, "Please keep the purpose short."),
  preferredDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date for your appointment.")
    .refine((value) => value >= manilaToday(), "Pick a date that has not passed.")
    // A year out is already generous for a barangay hall visit; beyond that is
    // almost certainly a typo or a script.
    .refine((value) => value <= manilaTodayNextYear(), "Please pick a date within the next year.")
    .refine(
      (value) => !isClosedDay(value),
      "The barangay hall is closed on weekends. Please pick a weekday.",
    ),
  preferredPeriod: z.enum(["am", "pm"], { error: "Pick morning or afternoon." }),
  consent: consentField,
});
