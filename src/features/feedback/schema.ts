import { z } from "zod";

/** The message ceiling, also enforced by the panel's live counter. */
export const MAX_FEEDBACK_MESSAGE = 1000;

/**
 * Shared by `actions.ts` (the authority) and `feedback-panel.tsx`, which uses it
 * to show the same message before spending a round trip.
 *
 * The screenshot is deliberately absent: `File` state lives outside the values
 * object, as in every other uploader here, and the action checks the file
 * separately. Do not "fix" this by adding a file field.
 *
 * The category literals are spelled out rather than derived from
 * FEEDBACK_CATEGORIES because `z.enum` needs a literal tuple to infer
 * `FeedbackCategory`. They mirror the `feedback_category` enum in migration
 * 0023 — adding one is a migration, and this line is the second place to change.
 */
export const feedbackSchema = z.object({
  category: z.enum(["general", "bug", "feature", "complaint", "praise"]),
  subject: z
    .string()
    .trim()
    .min(4, "Give this a short title.")
    .max(120, "Please keep the title under 120 characters."),
  message: z
    .string()
    .trim()
    .min(10, "Please tell us a little more so we can act on it.")
    .max(MAX_FEEDBACK_MESSAGE, `Please keep the message under ${MAX_FEEDBACK_MESSAGE} characters.`),
  // 0 is "not rated" across the client boundary; the action stores null.
  rating: z
    .number()
    .int("Choose a whole number of stars.")
    .min(0, "Choose between one and five stars.")
    .max(5, "Choose between one and five stars."),
  // Captured, never typed. Rooted-path only: anything else arriving here was
  // not produced by the widget.
  pagePath: z
    .string()
    .max(200)
    .refine((value) => value.startsWith("/"), "Invalid page reference."),
});
