import { Bug, Frown, Heart, Lightbulb, MessageSquare } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FeedbackCategory, FeedbackRow } from "@/types";

/**
 * The five categories the widget offers.
 *
 * "Suggestion" rather than "Feature Request": a resident is not filing against
 * a backlog. Stored as an enum in Postgres, so adding one is a migration —
 * unlike INQUIRY_SUBJECTS, which is text precisely so the barangay can extend
 * it without one. The difference is deliberate: these five describe kinds of
 * feedback about software, which is a fixed list, not barangay business, which
 * is not.
 */
export const FEEDBACK_CATEGORIES: readonly {
  value: FeedbackCategory;
  label: string;
  icon: LucideIcon;
}[] = [
  { value: "general", label: "General", icon: MessageSquare },
  { value: "bug", label: "Bug Report", icon: Bug },
  { value: "feature", label: "Suggestion", icon: Lightbulb },
  { value: "complaint", label: "Complaint", icon: Frown },
  { value: "praise", label: "Praise", icon: Heart },
];

/*
 * There is deliberately no FEEDBACK_CATEGORY_VALUES twin of
 * INQUIRY_SUBJECT_VALUES. That array exists because `inquiries.subject` is a
 * text column, so its schema has to `.refine()` against the list at runtime.
 * These five are a Postgres enum and the schema is a `z.enum` over the same
 * literals, which needs a literal tuple rather than a derived array — a values
 * export would have no caller.
 */

/**
 * Display label for a stored category. Falls back to the raw value, mirroring
 * `inquirySubjectLabel`, so a row written before a rename still shows something.
 */
export function feedbackCategoryLabel(value: string): string {
  return FEEDBACK_CATEGORIES.find((category) => category.value === value)?.label ?? value;
}

/**
 * Mean rating over the rows that carry one, to one decimal place, or null when
 * none do.
 *
 * Unrated rows are excluded rather than counted as zero — the field is optional,
 * and treating "did not say" as "one star" would make the stat card lie in the
 * one direction that matters.
 */
export function averageRating(rows: Pick<FeedbackRow, "rating">[]): number | null {
  const rated = rows.filter((row): row is { rating: number } => typeof row.rating === "number");
  if (rated.length === 0) return null;
  const total = rated.reduce((sum, row) => sum + row.rating, 0);
  return Math.round((total / rated.length) * 10) / 10;
}
