import type { SiteBlock, SiteBlockKey, SiteItemValues } from "@/types";

/**
 * What each editable block on the Home and About pages is, and which of the
 * three generic text slots it actually uses (sub-project 9).
 *
 * `site_items` carries `label` / `value` / `body` for every collection, so the
 * meaning of those columns is per-block knowledge. Kept in ONE table here —
 * mirroring the table in migration 0021 and the CHECK constraint that enforces
 * it — rather than as a switch inside the form, a switch inside the list, and a
 * third switch inside the validator. Adding a block should mean adding a row.
 */

export interface SiteBlockField {
  key: keyof SiteItemValues;
  label: string;
  /** Shown under the input. Say what the field IS on the page, not how to type. */
  hint?: string;
  type: "text" | "textarea" | "icon" | "href";
  required: boolean;
}

export interface SiteBlockSpec {
  block: SiteBlock;
  page: SitePage;
  title: string;
  description: string;
  /** Plural, for accessible labels: "Reorder the carousel slides". */
  noun: string;
  /** Singular, for buttons and dialogs: "Add slide", "Delete this slide?". */
  itemNoun: string;
  fields: SiteBlockField[];
  image: { required: boolean; /** Offers the cover/contain choice. */ fit: boolean } | null;
}

export type SitePage = "home" | "about";

const ICON_FIELD: SiteBlockField = {
  key: "iconName",
  label: "Icon",
  type: "icon",
  required: true,
};

export const SITE_BLOCK_SPECS: SiteBlockSpec[] = [
  {
    block: "hero_slides",
    page: "home",
    title: "Hero carousel",
    description:
      "Photographs behind the welcome text at the top of the home page. They cross-fade every few seconds.",
    noun: "carousel slides",
    itemNoun: "slide",
    fields: [],
    image: { required: true, fit: false },
  },
  {
    block: "glance_stats",
    page: "home",
    title: "Barangay at a glance",
    description:
      "The figures in the third column of the home page dashboard. These came from the Ecological Profile; editing them here does not update that document.",
    noun: "glance statistics",
    itemNoun: "statistic",
    fields: [
      ICON_FIELD,
      { key: "label", label: "Label", hint: "e.g. “Total Population”.", type: "text", required: true },
      { key: "value", label: "Figure", hint: "e.g. “1,228” or “8.95 ha”.", type: "text", required: true },
      {
        key: "body",
        label: "Note",
        hint: "Optional small print under the figure, e.g. “as of 2024”.",
        type: "text",
        required: false,
      },
    ],
    image: null,
  },
  {
    block: "involvement_items",
    page: "home",
    title: "Ways to get involved",
    description: "The four items beside the “Get Involved” banner near the foot of the home page.",
    noun: "involvement items",
    itemNoun: "item",
    fields: [
      ICON_FIELD,
      { key: "label", label: "Title", type: "text", required: true },
      { key: "body", label: "Description", type: "textarea", required: true },
    ],
    image: null,
  },
  {
    block: "core_values",
    page: "about",
    title: "Core values",
    description: "The row of values under the mission and vision cards.",
    noun: "core values",
    itemNoun: "value",
    fields: [
      ICON_FIELD,
      { key: "label", label: "Title", type: "text", required: true },
      { key: "body", label: "Description", type: "textarea", required: true },
    ],
    image: null,
  },
  {
    block: "history_entries",
    page: "about",
    title: "History timeline",
    description:
      "The alternating timeline under “Our Rich History”. Entries appear in the order below, earliest first.",
    noun: "history entries",
    itemNoun: "entry",
    fields: [
      { key: "value", label: "Year", hint: "e.g. “1733”, or a word like “Today”.", type: "text", required: true },
      { key: "label", label: "Title", type: "text", required: true },
      { key: "body", label: "Description", type: "textarea", required: true },
    ],
    image: { required: true, fit: true },
  },
  {
    block: "milestones",
    page: "about",
    title: "Community programs",
    description: "The numbered programme cards under “Community Programs”.",
    noun: "community programs",
    itemNoun: "program",
    fields: [
      ICON_FIELD,
      { key: "label", label: "Title", type: "text", required: true },
      { key: "body", label: "Description", type: "textarea", required: true },
      {
        key: "value",
        label: "Source",
        hint: "Where the claim comes from, e.g. “Barangay Development Plan”.",
        type: "text",
        required: true,
      },
    ],
    image: null,
  },
];

export function specFor(block: SiteBlock): SiteBlockSpec {
  // Every SiteBlock has a spec above; the non-null assertion is safe because
  // both lists are derived from the same union. Quick Services was removed
  // from BOTH in 0022 — never from one alone.
  return SITE_BLOCK_SPECS.find((spec) => spec.block === block)!;
}

/** The singleton text/image blocks, in the order they appear on their page. */
export interface SiteSingletonSpec {
  key: SiteBlockKey;
  page: SitePage;
  title: string;
  description: string;
  kind: "text" | "image";
  /** Textarea rows; ignored for images. */
  rows?: number;
}

export const SITE_SINGLETON_SPECS: SiteSingletonSpec[] = [
  {
    key: "about.mission",
    page: "about",
    title: "Mission",
    description:
      "The left card at the top of the About page. Clearing it hides that card rather than leaving an empty one.",
    kind: "text",
    rows: 6,
  },
  {
    key: "about.vision",
    page: "about",
    title: "Vision",
    description: "The dark card beside the mission. Clearing it hides that card.",
    kind: "text",
    rows: 6,
  },
  {
    key: "about.captain_message",
    page: "about",
    title: "Punong Barangay's message",
    description:
      "The quoted message on the About page. Leave a blank line between paragraphs — each becomes its own quote. The name, role and portrait beside it come from the Officials directory, not from here.",
    kind: "text",
    rows: 10,
  },
  {
    key: "home.cta_image",
    page: "home",
    title: "Get Involved banner image",
    description:
      "The photograph behind the “Together, We Build a Stronger Community” band near the foot of the home page.",
    kind: "image",
  },
];
