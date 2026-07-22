"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  SITE_BLOCKS,
  SITE_BLOCK_KEYS,
  type SiteBlock,
  type SiteBlockKey,
  type SiteItemValues,
} from "@/types";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSiteItemForEdit } from "@/features/admin/queries/site-content";
import { SITE_ICON_OPTIONS } from "@/lib/icon-map";
import { discardImage, removeStoredImage, uploadSingleImage } from "@/lib/media";

export interface ActionResult {
  error: string | null;
}
export interface SaveResult {
  error: string | null;
  id: string | null;
}

/**
 * Home & About CMS writes (sub-project 9).
 *
 * There is no status action and no restore action in this module, and that is
 * the design rather than an unfinished edge: site content has no
 * draft → in-review → published → archived lifecycle (design §2.3), so **Save
 * writes live**, exactly as saving an already-published announcement does.
 * Everything else in the portal that reads as "missing" here — `statusPatch`,
 * `guardDelete`, the Active | Archived toggle — follows from that one decision.
 */

/**
 * The single most load-bearing helper in the sub-project.
 *
 * `/` and `/about` are both cached (the home page under `revalidate = 3600`),
 * so without an explicit invalidation an editor saves the mission statement,
 * reloads the page, sees the old text and concludes the CMS is broken. Every
 * action below calls this — including the ones that "only" reorder, since the
 * order is what the page renders. Design §2.5.
 */
function revalidate() {
  revalidatePath("/admin/site-content");
  revalidatePath("/");
  revalidatePath("/about");
}

/* ── Field-level schemas ──────────────────────────────────────────────────
 *
 * Server Actions are public HTTP endpoints, so the shape the `site_items_shape`
 * CHECK constraint enforces is re-validated here. Relying on the constraint
 * alone would technically be safe but would surface as "new row violates check
 * constraint site_items_shape" in the drawer — accurate, and useless to the
 * barangay secretary who forgot the alt text.
 */

/** A slot this block requires: null, "" and "   " all fail with one message. */
function requiredText(message: string) {
  return z.string(message).trim().min(1, message);
}

/** A slot this block may leave empty: "" and whitespace become SQL NULL. */
const optionalText = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((raw) => {
    const trimmed = (raw ?? "").trim();
    return trimmed.length > 0 ? trimmed : null;
  });

// Validated against the picker's own option list, so a name that `resolveIcon`
// could not resolve can never be stored — the public page would silently fall
// back to a generic document icon and nobody would know why.
const ICON_NAMES = new Set(SITE_ICON_OPTIONS.map((option) => option.value));
const iconNameSchema = requiredText("Choose an icon.").refine(
  (name) => ICON_NAMES.has(name),
  "Choose an icon from the list.",
);

// Quick-service cards render as site navigation, so the link must stay in-site.
// `//evil.example` is rejected alongside `https://…`: it starts with a slash but
// is a protocol-relative URL that leaves the site.
const hrefSchema = requiredText("Enter the page this card opens.").refine(
  (href) => /^\/(?!\/)/.test(href),
  "Links must be in-site paths starting with / — for example /services.",
);

// The path is resolved server-side (an upload this action just performed, or
// the path the row already held), never taken from the request body. The regex
// is belt-and-braces against a future caller that passes one through, and
// matches both shapes the bucket holds: uploaded `site/<uuid>.<ext>` objects
// and the deterministic seed paths.
const imagePathSchema = z
  .string("Add a photo.")
  .regex(/^site\/[A-Za-z0-9._-]+$/, "Invalid image path.");

const imageAltSchema = requiredText("Add alt text describing the photo.");

const imageFitSchema = z.enum(
  ["cover", "contain"],
  "Choose whether the photo fills or fits its frame.",
);

/* ── Per-block shapes ─────────────────────────────────────────────────────── */

/** The eight content columns, as the row is written. */
interface ItemColumns {
  icon_name: string | null;
  label: string | null;
  value: string | null;
  body: string | null;
  href: string | null;
  image_path: string | null;
  image_alt: string | null;
  image_fit: string | null;
}

/**
 * Every save starts from all-null and fills in only the columns its block uses.
 * The drawer holds one `SiteItemValues` object whatever the block, so it will
 * happily send an `href` alongside a core value; persisting that would make
 * migration 0021's per-block meaning table a lie the moment anyone read the row.
 */
const EMPTY_COLUMNS: ItemColumns = {
  icon_name: null,
  label: null,
  value: null,
  body: null,
  href: null,
  image_path: null,
  image_alt: null,
  image_fit: null,
};

/** `involvement_items` and `core_values` are the same shape with different copy. */
function valueItemSchema(titleMessage: string, bodyMessage: string) {
  return z
    .object({
      label: requiredText(titleMessage),
      body: requiredText(bodyMessage),
      iconName: iconNameSchema,
    })
    .transform(
      (v): ItemColumns => ({
        ...EMPTY_COLUMNS,
        label: v.label,
        body: v.body,
        icon_name: v.iconName,
      }),
    );
}

// Mirrors the CASE arms of `site_items_shape` one for one. If a block is ever
// added to the enum, it needs an arm there AND an entry here — the constraint
// silently accepts anything for an unmatched CASE (an unmatched CASE returns
// NULL, and a NULL CHECK passes), so this map would be the only guard left.
const BLOCK_SCHEMAS: Record<SiteBlock, z.ZodType<ItemColumns>> = {
  hero_slides: z
    .object({ imagePath: imagePathSchema, imageAlt: imageAltSchema })
    .transform(
      (v): ItemColumns => ({
        ...EMPTY_COLUMNS,
        image_path: v.imagePath,
        image_alt: v.imageAlt,
      }),
    ),

  quick_services: z
    .object({
      label: requiredText("Enter the service name."),
      value: requiredText("Enter the button label."),
      href: hrefSchema,
      iconName: iconNameSchema,
    })
    .transform(
      (v): ItemColumns => ({
        ...EMPTY_COLUMNS,
        label: v.label,
        value: v.value,
        href: v.href,
        icon_name: v.iconName,
      }),
    ),

  glance_stats: z
    .object({
      label: requiredText("Enter the stat label."),
      value: requiredText("Enter the stat figure."),
      body: optionalText,
      iconName: iconNameSchema,
    })
    .transform(
      (v): ItemColumns => ({
        ...EMPTY_COLUMNS,
        label: v.label,
        value: v.value,
        body: v.body,
        icon_name: v.iconName,
      }),
    ),

  involvement_items: valueItemSchema(
    "Enter the invitation title.",
    "Enter a short description.",
  ),

  core_values: valueItemSchema("Enter the value's name.", "Enter a short description."),

  history_entries: z
    .object({
      label: requiredText("Enter the entry title."),
      value: requiredText("Enter the year, or a word like “Today”."),
      body: requiredText("Enter the entry's description."),
      imagePath: imagePathSchema,
      imageAlt: imageAltSchema,
      imageFit: imageFitSchema,
    })
    .transform(
      (v): ItemColumns => ({
        ...EMPTY_COLUMNS,
        label: v.label,
        value: v.value,
        body: v.body,
        image_path: v.imagePath,
        image_alt: v.imageAlt,
        image_fit: v.imageFit,
      }),
    ),

  milestones: z
    .object({
      label: requiredText("Enter the programme name."),
      value: requiredText("Enter where this figure comes from."),
      body: requiredText("Enter the programme's description."),
      iconName: iconNameSchema,
    })
    .transform(
      (v): ItemColumns => ({
        ...EMPTY_COLUMNS,
        label: v.label,
        value: v.value,
        body: v.body,
        icon_name: v.iconName,
      }),
    ),
};

const blockSchema = z.enum(SITE_BLOCKS);
const blockKeySchema = z.enum(SITE_BLOCK_KEYS);

// `z.uuid()` is the zod v4 top-level form; the v3 `z.string().uuid()` spelling
// is deprecated in v4. 100 is far above any list a page could sensibly hold.
const reorderSchema = z.array(z.uuid()).min(1).max(100);

/**
 * The singleton value is a string from a textarea, but a direct POST can send a
 * number or an object — validate before anything calls `.trim()` on it.
 */
const rawValueSchema = z.string().nullish();

/**
 * An image reference is either an owned `site/` object path or a remote URL:
 * the get-involved banner is seeded as its original lh3 hotlink so the migration
 * changes nothing on deploy, and stays valid until someone uploads over it.
 * Anything else — a `javascript:` or `data:` URI — must never reach an
 * `<Image src>`.
 */
const imageReferenceSchema = z
  .string("Choose an image.")
  .refine(
    (ref) => /^https?:\/\//i.test(ref) || /^site\/[A-Za-z0-9._-]+$/.test(ref),
    "That image reference is not valid.",
  );

/* ── Human labels for the audit trail ─────────────────────────────────────── */

const SITE_BLOCK_KEY_LABELS: Record<SiteBlockKey, string> = {
  "about.mission": "Mission",
  "about.vision": "Vision",
  "about.captain_message": "Punong Barangay's message",
  "home.cta_image": "Get-involved banner image",
};

const SITE_BLOCK_LABELS: Record<SiteBlock, string> = {
  hero_slides: "Hero carousel",
  quick_services: "Quick services",
  glance_stats: "Barangay at a glance",
  involvement_items: "Get involved",
  core_values: "Core values",
  history_entries: "History timeline",
  milestones: "Community programs",
};

/**
 * Captured at write time, like every other `entityLabel` — resolving it at read
 * time would break precisely when the row is deleted. A hero slide has no text
 * of its own, so the section name is the whole identity it has.
 */
function itemLabel(block: SiteBlock, columns: ItemColumns): string {
  const section = SITE_BLOCK_LABELS[block];
  return columns.label ? `${section} — ${columns.label}` : section;
}

/**
 * Client-callable counterpart to `getSiteItemForEdit` (which is `server-only`
 * and cannot be imported into the "use client" manager).
 */
export async function getSiteItemForEditAction(id: string) {
  if (!(await checkPermission("manage-site-content"))) return null;
  return getSiteItemForEdit(id);
}

/**
 * Save one singleton block. Mission and vision may be blanked (§2.6): an empty
 * field is stored as SQL NULL so a cleared block and a never-seeded one read
 * identically, and the public page hides the card either way rather than
 * rendering an empty bordered box.
 */
export async function saveSiteBlock(
  key: SiteBlockKey,
  value: string | null,
  imageForm: FormData,
): Promise<ActionResult> {
  const actor = await checkPermission("manage-site-content");
  if (!actor) return { error: NOT_FOUND };

  const keyResult = blockKeySchema.safeParse(key);
  if (!keyResult.success) return { error: "Unknown content block." };
  const targetKey = keyResult.data;

  const rawValue = rawValueSchema.safeParse(value);
  if (!rawValue.success) return { error: "Invalid value." };

  const admin = createSupabaseAdminClient();

  // Read the current value first: it is the only record of which storage object
  // the banner points at, and it has to be known before the row stops
  // referencing it.
  const { data: existing, error: readErr } = await admin
    .from("site_blocks")
    .select("value")
    .eq("key", targetKey)
    .maybeSingle();
  if (readErr) return { error: "Could not save this section." };
  const previous = (existing?.value as string | null) ?? null;

  // One key of the four holds an image reference rather than prose. Branching
  // on the key beats a second action: the drawer is one form either way.
  const isImage = targetKey === "home.cta_image";

  // Upload before the row write, so the compensating delete below has something
  // to compensate. Sub-project 7's invariant: an object exists only if a row
  // references it.
  let uploadedPath: string | null = null;
  if (isImage) {
    const incoming = imageForm.get("image");
    if (incoming instanceof File && incoming.size > 0) {
      const uploaded = await uploadSingleImage("site", incoming);
      if (uploaded.error) return { error: uploaded.error };
      uploadedPath = uploaded.src;
    }
  }

  async function fail(error: string): Promise<ActionResult> {
    if (uploadedPath) {
      const removed = await removeStoredImage(uploadedPath);
      // A failed compensating delete is a second, independent failure: the
      // caller must still see the original error, but the orphan it leaves is
      // invisible otherwise, so log the path for a human.
      if (removed.error) {
        console.error(`Orphaned storage object (compensating delete failed): ${uploadedPath}`);
      }
    }
    return { error };
  }

  let nextValue: string | null;
  if (isImage) {
    // A new upload wins; otherwise the incoming reference (the unchanged
    // existing one, in practice) is kept.
    const candidate = uploadedPath ?? rawValue.data?.trim() ?? "";
    if (candidate.length === 0) {
      nextValue = null;
    } else {
      const parsedRef = imageReferenceSchema.safeParse(candidate);
      if (!parsedRef.success) {
        return fail(parsedRef.error.issues[0]?.message ?? "That image is not valid.");
      }
      nextValue = parsedRef.data;
    }
  } else {
    const trimmed = rawValue.data?.trim() ?? "";
    nextValue = trimmed.length > 0 ? trimmed : null;
  }

  const { error } = await admin
    .from("site_blocks")
    .upsert({ key: targetKey, value: nextValue, updated_by: actor.id }, { onConflict: "key" });
  if (error) return fail("Could not save this section.");

  // Deferred delete: only once the row no longer references the old object.
  // `discardImage` leaves the seeded lh3 URL alone — it is not ours to remove.
  if (isImage && previous && previous !== nextValue) {
    await discardImage(previous, "site banner replaced");
  }

  await recordActivity(actor, {
    type: "update",
    action: "updated site content",
    entityType: "site content",
    entityId: targetKey,
    entityLabel: SITE_BLOCK_KEY_LABELS[targetKey],
  });
  revalidate();
  return { error: null };
}

/**
 * Insert or update one collection item. `block` is a parameter rather than part
 * of `values` because it decides which schema the values are judged against —
 * and, on an update, it is checked against the row's stored block so an item
 * cannot be moved between sections and validated against the wrong shape.
 */
export async function saveSiteItem(
  id: string | null,
  block: SiteBlock,
  values: SiteItemValues,
  imageForm: FormData,
): Promise<SaveResult> {
  const actor = await checkPermission("manage-site-content");
  if (!actor) return { error: NOT_FOUND, id: null };

  const blockResult = blockSchema.safeParse(block);
  if (!blockResult.success) return { error: "Unknown content block.", id: null };
  const targetBlock = blockResult.data;

  const admin = createSupabaseAdminClient();

  // Read the existing row before uploading: for the two image blocks, whether
  // the shape is satisfied depends on the image the row ALREADY holds, so
  // validation cannot run until both that and any new upload are known.
  let existingImagePath: string | null = null;
  if (id) {
    const { data: existing, error: readErr } = await admin
      .from("site_items")
      .select("block, image_path")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return { error: "Could not save this item.", id: null };
    if (!existing) return { error: "That item no longer exists. Refresh the page.", id: null };
    if (existing.block !== targetBlock) {
      return { error: "That item belongs to a different section.", id: null };
    }
    existingImagePath = existing.image_path as string | null;
  }

  // Deferred uploads (sub-project 7): the picker made no network call, so this
  // is the first and only place the file reaches storage. Everything after it
  // must clean up on failure — that is what `fail()` is for.
  const incoming = imageForm.get("image");
  const removeImage = imageForm.get("removeImage") === "1";
  let uploadedPath: string | null = null;
  if (incoming instanceof File && incoming.size > 0) {
    const uploaded = await uploadSingleImage("site", incoming);
    if (uploaded.error) return { error: uploaded.error, id: null };
    uploadedPath = uploaded.src;
  }

  async function fail(error: string): Promise<SaveResult> {
    if (uploadedPath) {
      const removed = await removeStoredImage(uploadedPath);
      if (removed.error) {
        console.error(`Orphaned storage object (compensating delete failed): ${uploadedPath}`);
      }
    }
    return { error, id: null };
  }

  const nextImagePath = uploadedPath ?? (removeImage ? null : existingImagePath);

  // Validation runs AFTER the upload, so a rejected form deletes the object it
  // just created rather than leaving it behind. `fail()` covers that.
  const parsed = BLOCK_SCHEMAS[targetBlock].safeParse({ ...values, imagePath: nextImagePath });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid values.");
  const columns = parsed.data;

  if (id) {
    const { data: updated, error } = await admin
      .from("site_items")
      .update({ ...columns, updated_by: actor.id })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) return fail("Could not save this item.");
    if (!updated) return fail("That item no longer exists. Refresh the page.");

    // Deferred delete: only once the row no longer references the old object.
    if (existingImagePath && existingImagePath !== nextImagePath) {
      await discardImage(existingImagePath, "site image replaced");
    }

    await recordActivity(actor, {
      type: "update",
      action: "updated site content",
      entityType: "site content",
      entityId: id,
      entityLabel: itemLabel(targetBlock, columns),
    });
    revalidate();
    return { error: null, id };
  }

  // New items land at the end of THEIR OWN block — `sort_order` is scoped by
  // `block`, so a global max would leave gaps and make every list's numbering
  // depend on unrelated sections. The seeds are 0-based, hence `-1` for the
  // empty-block case.
  const { data: last, error: lastErr } = await admin
    .from("site_items")
    .select("sort_order")
    .eq("block", targetBlock)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastErr) return fail("Could not create this item.");
  const nextOrder = ((last?.sort_order as number | undefined) ?? -1) + 1;

  const { data, error } = await admin
    .from("site_items")
    .insert({ ...columns, block: targetBlock, sort_order: nextOrder, updated_by: actor.id })
    .select("id")
    .single();
  if (error || !data) return fail("Could not create this item.");

  await recordActivity(actor, {
    type: "create",
    action: "created site content",
    entityType: "site content",
    entityId: data.id as string,
    entityLabel: itemLabel(targetBlock, columns),
  });
  revalidate();
  return { error: null, id: data.id as string };
}

/**
 * Delete one collection item, directly.
 *
 * NOT `guardDelete`: that helper requires the row to be `archived` first, and
 * these tables have no status column at all — the precondition could never be
 * satisfied, so every delete would fail. A carousel slide is a list item, not a
 * record with a lifecycle; "archive the third slide" is not something anyone
 * means (design §2.4). The gate is `manage-site-content` plus the drawer's
 * ConfirmDialog, not SuperAdmin.
 */
export async function deleteSiteItem(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-site-content");
  if (!actor) return { error: NOT_FOUND };

  const admin = createSupabaseAdminClient();

  // Read the object path while the row still exists. Postgres knows nothing
  // about Storage, so once the row is gone the path is unrecoverable and the
  // object is orphaned forever.
  const { data: existing, error: readErr } = await admin
    .from("site_items")
    .select("block, label, image_path")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { error: "Could not delete this item." };
  if (!existing) return { error: "That item no longer exists. Refresh the page." };

  const { error } = await admin.from("site_items").delete().eq("id", id);
  if (error) return { error: "Could not delete this item." };

  // Best-effort, and deliberately after the delete: the row is already gone, so
  // failing the user's action over a leftover file would be both untrue and
  // unactionable. `discardImage` logs the orphan instead.
  await discardImage(existing.image_path as string | null, "site item deleted");

  await recordActivity(actor, {
    type: "delete",
    action: "deleted site content",
    entityType: "site content",
    entityId: id,
    entityLabel: itemLabel(existing.block as SiteBlock, {
      ...EMPTY_COLUMNS,
      label: existing.label as string | null,
    }),
  });
  revalidate();
  return { error: null };
}

/**
 * Rewrite one block's positions from an ordered id list (the drag handle's only
 * write path).
 *
 * A sequential loop rather than `upsert`: upsert's INSERT arm would fire for any
 * id that did not match, and a payload of `{ id, sort_order }` violates both the
 * NOT NULL `block` column and the `site_items_shape` CHECK. Seven short lists
 * are not worth a stored procedure.
 */
export async function reorderSiteItems(
  block: SiteBlock,
  orderedIds: string[],
): Promise<ActionResult> {
  const actor = await checkPermission("manage-site-content");
  if (!actor) return { error: NOT_FOUND };

  const blockResult = blockSchema.safeParse(block);
  if (!blockResult.success) return { error: "Unknown content block." };
  const parsed = reorderSchema.safeParse(orderedIds);
  if (!parsed.success) return { error: "Invalid ordering." };
  const targetBlock = blockResult.data;
  const ids = parsed.data;

  const admin = createSupabaseAdminClient();

  // The ids must be exactly this block's rows. Without the check a crafted
  // request could hand over ids from another block and renumber it, and a
  // partial list would leave the rows it omitted holding colliding positions.
  // Comparing sizes also rejects a duplicated id, since the set collapses it.
  const { data: rows, error: readErr } = await admin
    .from("site_items")
    .select("id")
    .eq("block", targetBlock);
  if (readErr || !rows) return { error: "Could not save the new order." };
  const known = new Set(rows.map((row) => row.id as string));
  if (known.size !== ids.length || ids.some((id) => !known.has(id))) {
    return { error: "That list changed while you were editing. Refresh and try again." };
  }

  // 0-based, matching the seeded rows and the public queries' plain
  // `order("sort_order")`.
  for (const [index, id] of ids.entries()) {
    const { error } = await admin
      .from("site_items")
      .update({ sort_order: index, updated_by: actor.id })
      .eq("id", id);
    if (error) return { error: "Could not save the new order." };
  }

  await recordActivity(actor, {
    type: "reorder",
    action: "reordered site content",
    entityType: "site content",
    entityLabel: SITE_BLOCK_LABELS[targetBlock],
  });
  revalidate();
  return { error: null };
}
