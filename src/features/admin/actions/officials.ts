"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ContentStatus, OfficialValues } from "@/types";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { auditTypeForStatus, recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOfficialForEdit } from "@/features/admin/queries/officials";
import { PUBLIC_MEDIA_BUCKET } from "@/lib/storage";
import { removeStoredImage } from "./media";

export interface ActionResult {
  error: string | null;
}
export interface SaveResult {
  error: string | null;
  id: string | null;
}

/** Optional text field: "" from an input means "not set" → SQL NULL. */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable();

const schema = z.object({
  name: z.string().trim().min(3, "Enter the official's full name."),
  role: z.string().trim().min(3, "Enter their position."),
  group: z.enum(["executive", "council", "administration"]),
  badge: optionalText,
  // A `public-media` officials object path only — never a remote URL. Accepts
  // both seeded paths (officials/dominic-b-dela-cruz.jpg) and uploaded paths
  // (officials/<uuid>.<ext>); rejects anything `next/image` would 500 on.
  photoPath: z
    .string()
    .regex(/^officials\/[A-Za-z0-9._-]+$/, "Invalid portrait path.")
    .nullable(),
  photoAlt: z.string(),
  term: z.string().trim(),
  email: optionalText,
  phone: optionalText,
  bio: z.string(),
});

// Server Actions are public HTTP endpoints — `ContentStatus` only constrains
// callers that go through TypeScript. A direct POST can send any string.
const statusSchema = z.enum(["draft", "in-review", "published", "archived"]);

// `z.uuid()` is the zod v4 top-level form; the v3 `z.string().uuid()` spelling
// is deprecated in v4.
const reorderSchema = z.array(z.uuid()).min(1).max(200);

/** Honorifics are titles, not names — they make for noisy, colliding URLs. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/^(hon\.?|ms\.?|mrs\.?|mr\.?|dr\.?|engr\.?)\s+/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function revalidate(slug?: string) {
  revalidatePath("/admin/officials");
  revalidatePath("/officials");
  // The About page's captain block reads the executive official from this same
  // table (see getPublishedExecutiveOfficial), and /about is statically
  // prerendered — without this it would serve a stale Punong Barangay until the
  // next deploy.
  revalidatePath("/about");
  if (slug) revalidatePath(`/officials/${slug}`);
}

// `ok` is a literal-typed discriminant so `if (!result.ok)` narrows `slug`.
type SlugResult = { ok: true; slug: string } | { ok: false; error: string };

/** Ensure a slug is unique, suffixing -2, -3… (ignoring the row being edited). */
async function uniqueSlug(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  base: string,
  ignoreId: string | null,
): Promise<SlugResult> {
  const { data, error } = await admin.from("officials").select("id, slug");
  if (error) return { ok: false, error: "Could not save the official. Try again." };
  const taken = new Set((data ?? []).filter((r) => r.id !== ignoreId).map((r) => r.slug));
  if (!taken.has(base)) return { ok: true, slug: base };
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return { ok: true, slug: candidate };
  }
}

/**
 * Client-callable counterpart to `getOfficialForEdit` (which is `server-only`
 * and cannot be imported into the "use client" manager).
 */
export async function getOfficialForEditAction(id: string) {
  if (!(await checkPermission("manage-officials"))) return null;
  return getOfficialForEdit(id);
}

export async function saveOfficial(
  id: string | null,
  values: OfficialValues,
): Promise<SaveResult> {
  const actor = await checkPermission("manage-officials");
  if (!actor) return { error: NOT_FOUND, id: null };
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid values.", id: null };
  }

  const admin = createSupabaseAdminClient();
  const base = slugify(parsed.data.name);
  if (!base) return { error: "Enter a name with letters or numbers.", id: null };

  const patch = {
    name: parsed.data.name,
    role: parsed.data.role,
    group: parsed.data.group,
    badge: parsed.data.badge,
    photo_path: parsed.data.photoPath,
    photo_alt: parsed.data.photoAlt,
    term: parsed.data.term,
    email: parsed.data.email,
    phone: parsed.data.phone,
    bio: parsed.data.bio,
  };

  if (id) {
    const { data: existing, error: readErr } = await admin
      .from("officials")
      .select("status, slug, photo_path, published_at")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return { error: "Could not save the official.", id: null };
    if (!existing) return { error: "Official not found.", id: null };

    // Lock the slug once EVER published (not just currently published) — a
    // shared or bookmarked profile URL must not move under whoever holds it,
    // even after an archive → edit → republish round-trip.
    const everPublished = existing.published_at !== null;
    let slug = existing.slug as string;
    if (!everPublished) {
      const slugResult = await uniqueSlug(admin, base, id);
      if (!slugResult.ok) return { error: slugResult.error, id: null };
      slug = slugResult.slug;
    }

    let query = admin.from("officials").update({ ...patch, slug }).eq("id", id);
    // The slug was computed against the published_at just read. If that read
    // saw no prior publish, re-assert it: should the official be published
    // concurrently, this update must not apply a slug computed against a now
    // stale (unpublished) state.
    if (!everPublished) {
      query = query.is("published_at", null);
    }
    const { data: updated, error } = await query.select("id").maybeSingle();
    if (error) return { error: "Could not save the official.", id: null };
    if (!updated) {
      return {
        error: everPublished
          ? "Official not found."
          : "This official was published while you were editing. Reopen and try again.",
        id: null,
      };
    }

    // Deferred delete: only once the row no longer references the old
    // portrait. A remote URL is left alone by removeStoredImage.
    const oldPath = existing.photo_path as string | null;
    if (oldPath && oldPath !== parsed.data.photoPath) {
      const removed = await removeStoredImage(oldPath);
      if (removed.error) {
        // A failed cleanup must not fail the save the user just made, but the
        // orphan it leaves is invisible otherwise — log the path for a human.
        console.error(`Orphaned storage object (portrait cleanup failed): ${oldPath}`);
      }
    }

    await recordActivity(actor, {
      type: "update",
      action: "updated official",
      entityType: "official",
      entityId: id,
      entityLabel: parsed.data.name,
    });
    revalidate(slug);
    return { error: null, id };
  }

  const slugResult = await uniqueSlug(admin, base, null);
  if (!slugResult.ok) return { error: slugResult.error, id: null };

  // New officials land at the end of the directory.
  const { data: last } = await admin
    .from("officials")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last?.sort_order as number) ?? 0) + 1;

  const { data, error } = await admin
    .from("officials")
    .insert({ ...patch, slug: slugResult.slug, sort_order: nextOrder })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not create the official.", id: null };

  await recordActivity(actor, {
    type: "create",
    action: "created official",
    entityType: "official",
    entityId: data.id,
    entityLabel: parsed.data.name,
  });
  revalidate(slugResult.slug);
  return { error: null, id: data.id };
}

/**
 * Move an official through draft → published → archived. `published_at` is set
 * once, on the first transition into published. Archiving is the normal path
 * for a departure: the record stays as term history.
 */
export async function setOfficialStatus(
  id: string,
  status: ContentStatus,
): Promise<ActionResult> {
  const actor = await checkPermission("manage-officials");
  if (!actor) return { error: NOT_FOUND };

  const statusResult = statusSchema.safeParse(status);
  if (!statusResult.success) {
    return { error: statusResult.error.issues[0]?.message ?? "Invalid status." };
  }
  const nextStatus = statusResult.data;

  const admin = createSupabaseAdminClient();
  const { data: existing, error: readErr } = await admin
    .from("officials")
    .select("name, slug, photo_path, photo_alt, published_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !existing) return { error: "Official not found." };

  // The public card and profile both lead with the portrait; publishing
  // without one would render a broken image on the directory.
  if (nextStatus === "published" && !existing.photo_path) {
    return { error: "Add a portrait before publishing this official." };
  }
  // A government site cannot ship an empty alt attribute on the portrait.
  if (nextStatus === "published" && !(existing.photo_alt as string | null)?.trim()) {
    return {
      error: "Add a description (alt text) for the portrait before publishing this official.",
    };
  }

  const patch: Record<string, unknown> = { status: nextStatus };
  if (nextStatus === "published" && !existing.published_at) {
    patch.published_at = new Date().toISOString();
  }

  const { error } = await admin.from("officials").update(patch).eq("id", id);
  if (error) return { error: "Could not update the official." };

  await recordActivity(actor, {
    type: auditTypeForStatus(nextStatus),
    action: `${nextStatus} official`,
    entityType: "official",
    entityId: id,
    entityLabel: existing.name as string,
  });
  revalidate(existing.slug as string);
  return { error: null };
}

/**
 * Hard delete — for mistakes only. Archiving is the normal path for a
 * departure (spec §6): the record is term history worth keeping.
 */
export async function deleteOfficial(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-officials");
  if (!actor) return { error: NOT_FOUND };
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("officials")
    .select("name, slug, photo_path")
    .eq("id", id)
    .maybeSingle();

  // Deleting the official cascades away its achievements and their photo
  // ROWS, but Postgres knows nothing about Storage. Collect the objects while
  // the rows still exist, or they are orphaned forever.
  const { data: achievements } = await admin
    .from("official_achievements")
    .select("id")
    .eq("official_id", id);
  const achievementIds = (achievements ?? []).map((row) => row.id as string);
  if (achievementIds.length > 0) {
    const { data: photos } = await admin
      .from("official_achievement_photos")
      .select("src")
      .in("achievement_id", achievementIds);
    const paths = (photos ?? [])
      .map((photo) => photo.src as string)
      .filter((src) => !/^https?:\/\//i.test(src));
    if (paths.length > 0) {
      const { error: removeErr } = await admin.storage.from(PUBLIC_MEDIA_BUCKET).remove(paths);
      if (removeErr) {
        // A failed cleanup must not fail the delete the user just made, but the
        // orphans it leaves are invisible otherwise — log the paths for a human.
        console.error(
          `Orphaned storage objects (achievement photo cleanup failed): ${paths.join(", ")}`,
        );
      }
    }
  }

  const { error } = await admin.from("officials").delete().eq("id", id);
  if (error) return { error: "Could not delete the official." };

  if (existing?.photo_path) {
    const removed = await removeStoredImage(existing.photo_path as string);
    if (removed.error) {
      console.error(`Orphaned storage object (portrait cleanup failed): ${existing.photo_path}`);
    }
  }
  await recordActivity(actor, {
    type: "delete",
    action: "deleted official",
    entityType: "official",
    entityId: id,
    entityLabel: (existing?.name as string) ?? "",
  });
  revalidate((existing?.slug as string) ?? undefined);
  return { error: null };
}

/**
 * Rewrite directory positions from an ordered id list. Twelve sequential
 * updates is the whole barangay council — not worth a stored procedure, and
 * upsert is not usable here (its INSERT arm would violate the NOT NULL
 * columns this partial payload omits).
 */
export async function reorderOfficials(orderedIds: string[]): Promise<ActionResult> {
  const actor = await checkPermission("manage-officials");
  if (!actor) return { error: NOT_FOUND };
  const parsed = reorderSchema.safeParse(orderedIds);
  if (!parsed.success) return { error: "Invalid ordering." };

  const admin = createSupabaseAdminClient();
  for (const [index, id] of parsed.data.entries()) {
    const { error } = await admin
      .from("officials")
      .update({ sort_order: index + 1 })
      .eq("id", id);
    if (error) return { error: "Could not save the new order." };
  }

  await recordActivity(actor, {
    type: "reorder",
    action: "reordered officials",
    entityType: "official",
  });
  revalidate();
  return { error: null };
}
