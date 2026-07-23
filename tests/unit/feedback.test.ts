import { describe, expect, it } from "vitest";
import { FEEDBACK_CATEGORIES, averageRating, feedbackCategoryLabel } from "@/features/feedback/data";
import { feedbackSchema } from "@/features/feedback/schema";

/**
 * The pure half of the feedback widget.
 *
 * The schema matters most: it is the same object the Server Action validates
 * with, so a boundary that is wrong here is wrong at the only gate this
 * unauthenticated endpoint has.
 */

const VALID = {
  category: "bug" as const,
  subject: "Download link is dead",
  message: "The 2025 budget PDF returns a 404 when I tap it.",
  rating: 0,
  pagePath: "/transparency",
};

describe("feedbackSchema", () => {
  it("accepts a complete report", () => {
    expect(feedbackSchema.safeParse(VALID).success).toBe(true);
  });

  it("accepts a report with no rating (0 means unrated)", () => {
    expect(feedbackSchema.safeParse({ ...VALID, rating: 0 }).success).toBe(true);
  });

  it("rejects a subject under 4 characters and accepts 4", () => {
    expect(feedbackSchema.safeParse({ ...VALID, subject: "abc" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...VALID, subject: "abcd" }).success).toBe(true);
  });

  it("rejects a subject over 120 characters and accepts 120", () => {
    expect(feedbackSchema.safeParse({ ...VALID, subject: "a".repeat(121) }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...VALID, subject: "a".repeat(120) }).success).toBe(true);
  });

  it("rejects a message under 10 characters and accepts 10", () => {
    expect(feedbackSchema.safeParse({ ...VALID, message: "too short" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...VALID, message: "just right" }).success).toBe(true);
  });

  it("rejects a message over 1000 characters and accepts 1000", () => {
    expect(feedbackSchema.safeParse({ ...VALID, message: "a".repeat(1001) }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...VALID, message: "a".repeat(1000) }).success).toBe(true);
  });

  it("rejects a rating outside 0–5", () => {
    expect(feedbackSchema.safeParse({ ...VALID, rating: -1 }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...VALID, rating: 6 }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...VALID, rating: 5 }).success).toBe(true);
  });

  it("rejects a rating that is not a whole number", () => {
    expect(feedbackSchema.safeParse({ ...VALID, rating: 3.5 }).success).toBe(false);
  });

  it("rejects a category outside the enum", () => {
    expect(feedbackSchema.safeParse({ ...VALID, category: "rant" }).success).toBe(false);
  });

  it("rejects a page path that is not a rooted path", () => {
    expect(feedbackSchema.safeParse({ ...VALID, pagePath: "https://evil.test" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...VALID, pagePath: "transparency" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...VALID, pagePath: "/" }).success).toBe(true);
  });

  it("trims the subject and message before measuring them", () => {
    const parsed = feedbackSchema.safeParse({ ...VALID, subject: "  Dead link  " });
    expect(parsed.success && parsed.data.subject).toBe("Dead link");
    expect(feedbackSchema.safeParse({ ...VALID, message: `  ${"a".repeat(9)}  ` }).success).toBe(false);
  });
});

describe("feedbackCategoryLabel", () => {
  it("resolves every declared category", () => {
    for (const category of FEEDBACK_CATEGORIES) {
      expect(feedbackCategoryLabel(category.value)).toBe(category.label);
    }
  });

  it("falls back to the raw value so a renamed category does not blank an old row", () => {
    expect(feedbackCategoryLabel("retired-category")).toBe("retired-category");
  });
});

describe("averageRating", () => {
  it("is null with no rows at all", () => {
    expect(averageRating([])).toBeNull();
  });

  it("is null when no row carries a rating", () => {
    expect(averageRating([{ rating: null }, { rating: null }])).toBeNull();
  });

  it("ignores unrated rows rather than counting them as zero", () => {
    expect(averageRating([{ rating: 4 }, { rating: null }, { rating: 5 }])).toBe(4.5);
  });

  it("rounds to one decimal place", () => {
    expect(averageRating([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toBe(4.3);
  });
});
