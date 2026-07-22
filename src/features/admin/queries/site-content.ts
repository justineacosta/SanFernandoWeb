import "server-only";
import type { AdminSiteItemRow, SiteBlock } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { photoUrl } from "@/lib/storage";

/**
 * Admin reads for the Home & About CMS (sub-project 9).
 *
 * No `ARCHIVE_SELECT` and no `toArchiveMeta` here, and no `status` column to
 * select: site content has no draft → in-review → published → archived
 * lifecycle (design §2.3), so there is no archived state to carry and no
 * Active | Archived toggle for the manager to feed. That absence is the
 * decision, not an omission — adding either would imply a workflow the tables
 * deliberately do not have.
 */

const ITEM_SELECT =
  "id, block, sort_order, icon_name, label, value, body, href, image_path, image_alt, image_fit";

interface SiteItemRow {
  id: string;
  block: SiteBlock;
  sort_order: number;
  icon_name: string | null;
  label: string | null;
  value: string | null;
  body: string | null;
  href: string | null;
  image_path: string | null;
  image_alt: string | null;
  image_fit: string | null;
}

function toAdminRow(row: SiteItemRow): AdminSiteItemRow {
  return {
    id: row.id,
    block: row.block,
    sortOrder: row.sort_order,
    iconName: row.icon_name,
    label: row.label,
    value: row.value,
    body: row.body,
    href: row.href,
    // Both spellings travel together: `imagePath` is what a save writes back,
    // `imageUrl` is what the preview renders. Deriving the URL in the manager
    // would put the bucket layout in a client component.
    imagePath: row.image_path,
    imageUrl: row.image_path ? photoUrl(row.image_path) : null,
    imageAlt: row.image_alt,
    // The `site_items_shape` CHECK plus the column's own CHECK allow only
    // 'cover', 'contain' or NULL, so this cast cannot widen anything the
    // database would accept.
    imageFit: (row.image_fit as "cover" | "contain" | null) ?? null,
  };
}

/**
 * Every collection item across all seven blocks, in the order the public pages
 * render them. One round trip for the whole manager: the seven lists together
 * are a few dozen short rows, so filtering per block in memory beats seven
 * queries.
 */
export async function listAdminSiteItems(): Promise<AdminSiteItemRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("site_items")
    .select(ITEM_SELECT)
    .order("block", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error || !data) return [];
  return (data as unknown as SiteItemRow[]).map(toAdminRow);
}

/** One item, for the drawer. */
export async function getSiteItemForEdit(id: string): Promise<AdminSiteItemRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("site_items")
    .select(ITEM_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return toAdminRow(data as unknown as SiteItemRow);
}

/**
 * The four singleton blocks as a key → value map.
 *
 * Unlike the public `getSiteBlocks`, a blank value is preserved as `null`
 * rather than dropped: the editor has to see that the mission is empty in
 * order to fill it in, whereas the public page only needs to know to hide the
 * card.
 */
export async function listAdminSiteBlocks(): Promise<Record<string, string | null>> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("site_blocks").select("key, value");
  if (error || !data) return {};

  const map: Record<string, string | null> = {};
  for (const row of data as { key: string; value: string | null }[]) {
    map[row.key] = row.value;
  }
  return map;
}
