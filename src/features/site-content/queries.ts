import "server-only";
import { cache } from "react";
import type {
  HeroSlide,
  Milestone,
  SiteBlock,
  SiteBlockKey,
  Stat,
  TimelineEntry,
  ValueItem,
} from "@/types";
import { resolveIcon } from "@/lib/icon-map";
import { photoUrl } from "@/lib/storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Public reads for the Home and About page content (sub-project 9).
 *
 * There is no `.eq("status", "published")` here, and its absence is deliberate:
 * site content has no draft/published workflow (design §2.3). What an editor
 * saves is what the page shows, exactly as with an already-published
 * announcement. The public boundary for THIS table is that there is nothing
 * unpublished to leak.
 *
 * Both fetches are wrapped in React's `cache` so a page whose five sections each
 * ask for their block still makes one round trip per request.
 */

interface SiteItemRow {
  id: string;
  block: SiteBlock;
  icon_name: string | null;
  label: string | null;
  value: string | null;
  body: string | null;
  href: string | null;
  image_path: string | null;
  image_alt: string | null;
  image_fit: string | null;
}

const fetchItems = cache(async (): Promise<SiteItemRow[]> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("site_items")
    .select("id, block, icon_name, label, value, body, href, image_path, image_alt, image_fit")
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data as SiteItemRow[];
});

async function itemsFor(block: SiteBlock): Promise<SiteItemRow[]> {
  return (await fetchItems()).filter((row) => row.block === block);
}

/**
 * The four singleton text blocks, as a key → value map. A missing row and a
 * blanked field are both `null`, and callers treat them the same: §2.6 hides
 * the card either way, so distinguishing "never seeded" from "deliberately
 * cleared" would buy the public page nothing.
 */
export const getSiteBlocks = cache(
  async (): Promise<Partial<Record<SiteBlockKey, string>>> => {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("site_blocks").select("key, value");
    if (error || !data) return {};
    const map: Partial<Record<SiteBlockKey, string>> = {};
    for (const row of data as { key: SiteBlockKey; value: string | null }[]) {
      const trimmed = row.value?.trim();
      if (trimmed) map[row.key] = trimmed;
    }
    return map;
  },
);

/** Paragraphs of the Punong Barangay's message, split on blank lines. */
export async function getCaptainMessage(): Promise<string[]> {
  const value = (await getSiteBlocks())["about.captain_message"];
  if (!value) return [];
  return value
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export async function listHeroSlides(): Promise<HeroSlide[]> {
  return (await itemsFor("hero_slides")).map((row) => ({
    src: photoUrl(row.image_path!),
    alt: row.image_alt ?? "",
  }));
}

export async function listGlanceStats(): Promise<Stat[]> {
  return (await itemsFor("glance_stats")).map((row) => ({
    label: row.label!,
    value: row.value!,
    note: row.body ?? undefined,
    icon: resolveIcon(row.icon_name ?? ""),
  }));
}

export async function listInvolvementItems(): Promise<ValueItem[]> {
  return (await itemsFor("involvement_items")).map(toValueItem);
}

export async function listCoreValues(): Promise<ValueItem[]> {
  return (await itemsFor("core_values")).map(toValueItem);
}

function toValueItem(row: SiteItemRow): ValueItem {
  return {
    title: row.label!,
    description: row.body!,
    icon: resolveIcon(row.icon_name ?? ""),
  };
}

export async function listHistoryTimeline(): Promise<TimelineEntry[]> {
  return (await itemsFor("history_entries")).map((row) => ({
    year: row.value!,
    title: row.label!,
    description: row.body!,
    image: photoUrl(row.image_path!),
    imageAlt: row.image_alt ?? "",
    imageFit: row.image_fit === "contain" ? "contain" : "cover",
  }));
}

export async function listMilestones(): Promise<Milestone[]> {
  return (await itemsFor("milestones")).map((row) => ({
    title: row.label!,
    meta: row.value!,
    description: row.body!,
    icon: resolveIcon(row.icon_name ?? ""),
  }));
}
