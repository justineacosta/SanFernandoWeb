import { z } from "zod";
import { consentField, residentFields } from "@/lib/public-forms";

/** Shared by `actions.ts` and `apply-form.tsx`. See `@/lib/public-forms`. */
export const applicationSchema = z.object({
  ...residentFields,
  purpose: z
    .string()
    .trim()
    .min(4, "Tell us what the document is for.")
    .max(500, "Please keep the purpose short."),
  consent: consentField,
});
