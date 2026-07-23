import { z } from "zod";
import { consentField, residentFields } from "@/lib/public-forms";

/** Shared by `actions.ts` and `assistance-form.tsx`. See `@/lib/public-forms`. */
export const assistanceSchema = z.object({
  ...residentFields,
  categoryId: z.string().trim().min(1, "Pick the kind of assistance you need."),
  details: z
    .string()
    .trim()
    .min(20, "Please tell us a little more about what you need.")
    .max(2000, "Please keep the details under 2000 characters."),
  consent: consentField,
});
