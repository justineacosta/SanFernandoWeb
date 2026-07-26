"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AnnouncementValues, AuditActionType, ContentStatus, SessionUser } from "@/types";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { guardDelete, statusPatch } from "@/lib/archive";
import { recordActivity } from "@/lib/audit";
import { discardImage, removeStoredImage, uploadSingleImage } from "@/lib/media";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAnnouncementForEdit } from "@/features/admin/queries/announcements";

export interface ActionResult {
  error: string | null;
}
export interface SaveResult {
  error: string | null;
  id: string | null;
}

const schema = z.object({
  title: z.string().trim().min(3, "Enter a title."),
  slug: z.string().trim().min(1, "Enter a slug."),
  date: z.string().trim().min(1, "Pick a date."),
  excerpt: z.string().trim().min(1, "Enter an excerpt."),
  body: z.string(),
  urgent: z.boolean(),
  imageSrc: z.string().trim().nullable(),
  imageAlt: z.string().trim(),
});

function slugify(title: string): string {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

type SlugResult = { slug: string; error: null } | { slug: null; error: string };

/** Ensure a slug is unique, suffixing -2, -3… (ignoring the row being edited). */
async function uniqueSlug(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  base: string,
  ignoreId: string | null,
): Promise<SlugResult> {
  const { data, error } = await admin.from("announcements").select("id, slug");
  if (error) return { slug: null, error: "Could not save the announcement. Try again." };
  const taken = new Set((data ?? []).filter((r) => r.id !== ignoreId).map((r) => r.slug));
  if (!taken.has(base)) return { slug: base, error: null };
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return { slug: `${base}-${n}`, error: null };
}

function revalidate() {
  revalidatePath("/admin/news");
  revalidatePath("/announcements");
  revalidatePath("/notices");
  revalidatePath("/");
}

/**
 * Client-callable counterpart to `getAnnouncementForEdit` (which is `server-only`
 * and so cannot be imported into the "use client" manager). The manager fetches
 * full editable detail only when a drawer is opened for editing.
 */
export async function getAnnouncementForEditAction(
  id: string,
): Promise<{ values: AnnouncementValues; status: ContentStatus } | null> {
  if (!(await checkPermission("manage-news"))) return null;
  return getAnnouncementForEdit(id);
}

export async function saveAnnouncement(
  id: string | null,
  values: AnnouncementValues,
  imageForm: FormData,
): Promise<SaveResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND, id: null };
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid values.", id: null };

  const admin = createSupabaseAdminClient();

  // Upload a newly chosen image up front — the only side effect before the row
  // write, so every failure past this point must delete the object it just
  // created. `fail()` does that.
  const incoming = imageForm.get("image");
  const removeImage = imageForm.get("removeImage") === "1";
  let uploadedPath: string | null = null;
  if (incoming instanceof File && incoming.size > 0) {
    const uploaded = await uploadSingleImage("announcements", incoming);
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

  // A new upload wins; an explicit remove clears the slot; otherwise the stored
  // value carries through untouched.
  const nextImageSrc = uploadedPath ?? (removeImage ? null : parsed.data.imageSrc);
  const nextImageAlt = nextImageSrc ? parsed.data.imageAlt : "";

  if (id) {
    // Read the stored path before overwriting it: whatever it pointed at is
    // orphaned by this save unless it survives into nextImageSrc.
    const { data: existing, error: readErr } = await admin
      .from("announcements")
      .select("image_src, status, slug")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return fail("Could not save the announcement.");
    if (!existing) return fail("Announcement not found.");

    const wasPublished = existing.status === "published";
    let slug = existing.slug;
    if (!wasPublished) {
      const slugResult = await uniqueSlug(admin, slugify(parsed.data.slug) || slugify(parsed.data.title), id);
      if (slugResult.error) return fail(slugResult.error);
      slug = slugResult.slug;
    }

    let query = admin
      .from("announcements")
      .update({
        title: parsed.data.title,
        slug,
        date: parsed.data.date,
        excerpt: parsed.data.excerpt,
        body: parsed.data.body,
        urgent: parsed.data.urgent,
        image_src: nextImageSrc,
        image_alt: nextImageAlt,
      })
      .eq("id", id);
    // The slug above was computed against the status just read. If that read
    // saw a non-published status, re-assert it in the WHERE: should the
    // announcement get published concurrently, this update must not silently
    // apply a slug computed against the now-stale status.
    if (!wasPublished) {
      query = query.in("status", ["draft", "in-review", "archived"]);
    }
    const { data: updated, error } = await query.select("id").maybeSingle();
    if (error) return fail("Could not save the announcement.");
    if (!updated) {
      return fail(
        wasPublished
          ? "Announcement not found."
          : "This announcement was published while you were editing. Reopen it and try again.",
      );
    }

    const previous = existing.image_src as string | null;
    if (previous && previous !== nextImageSrc) {
      await discardImage(previous, "announcement image replaced");
    }
    await recordActivity(actor, {
      type: "update",
      action: "updated announcement",
      entityType: "announcement",
      entityId: id,
      entityLabel: parsed.data.title,
    });
    revalidate();
    return { error: null, id };
  }

  const slugResult = await uniqueSlug(admin, slugify(parsed.data.slug) || slugify(parsed.data.title), null);
  if (slugResult.error) return fail(slugResult.error);
  const slug = slugResult.slug;

  const { data: inserted, error } = await admin
    .from("announcements")
    .insert({
      title: parsed.data.title,
      slug,
      date: parsed.data.date,
      excerpt: parsed.data.excerpt,
      body: parsed.data.body,
      urgent: parsed.data.urgent,
      image_src: nextImageSrc,
      image_alt: nextImageAlt,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !inserted) return fail("Could not create the announcement.");
  await recordActivity(actor, {
    type: "create",
    action: "created announcement",
    entityType: "announcement",
    entityId: inserted.id,
    entityLabel: parsed.data.title,
  });
  revalidate();
  return { error: null, id: inserted.id };
}

/**
 * Apply a status transition. The `from` set is enforced inside the UPDATE's
 * WHERE (not a read-then-write) so a concurrent transition can't race past
 * this check. `actor` is resolved by the caller so that every exported
 * action's own first statement is the `checkPermission` gate.
 */
async function applyTransition(
  actor: SessionUser,
  id: string,
  from: string[],
  patch: Record<string, unknown>,
  type: AuditActionType,
  verb: string,
): Promise<ActionResult> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("announcements")
    .update(patch)
    .eq("id", id)
    .in("status", from)
    .select("id, title")
    .maybeSingle();
  if (error) return { error: "Could not update the announcement." };
  if (!data) return { error: "This announcement is no longer in a state that allows that action." };
  await recordActivity(actor, { type, action: verb, entityType: "announcement", entityId: id, entityLabel: data.title });
  revalidate();
  return { error: null };
}

export async function submitAnnouncementForReview(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  return applyTransition(actor, id, ["draft"], { status: "in-review" }, "update", "submitted announcement for review");
}

export async function returnAnnouncementToDraft(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  return applyTransition(actor, id, ["in-review"], { status: "draft" }, "save_draft", "returned announcement to draft");
}

export async function archiveAnnouncement(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  return applyTransition(
    actor,
    id,
    ["draft", "in-review", "published"],
    statusPatch(actor, "archived"),
    "archive",
    "archived announcement",
  );
}

/** Bring an archived announcement back as a draft — not straight back onto the public page. */
export async function restoreAnnouncement(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  return applyTransition(
    actor,
    id,
    ["archived"],
    statusPatch(actor, "draft"),
    "restore",
    "restored announcement",
  );
}

/**
 * Hard delete — SuperAdmin only, and only from `archived` (umbrella §3.2).
 *
 * Deferred out of sub-project 6 because removing the image needs the storage
 * lifecycle work this sub-project does; archiving remains the normal way to
 * take an announcement off the site.
 */
export async function deleteAnnouncement(id: string): Promise<ActionResult> {
  const guard = await guardDelete<{ title: string; slug: string; image_src: string | null }>(
    "announcements",
    id,
    "title, slug, image_src",
  );
  if (!guard.ok) return { error: guard.error };
  const { actor, row: existing } = guard;

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("announcements").delete().eq("id", id);
  if (error) return { error: "Could not delete the announcement." };

  // Only once the row is gone: an object deleted ahead of a failed row delete
  // would leave a live announcement pointing at nothing.
  await discardImage(existing.image_src, "announcement deleted");
  await recordActivity(actor, {
    type: "delete",
    action: "deleted announcement",
    entityType: "announcement",
    entityId: id,
    entityLabel: existing.title,
  });
  revalidatePath(`/notices/${existing.slug}`);
  revalidate();
  return { error: null };
}

/** Publish; set published_at only on first publish so re-publishing an archived announcement doesn't bump it. */
export async function publishAnnouncement(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  const admin = createSupabaseAdminClient();
  const { data: row, error: readErr } = await admin
    .from("announcements")
    .select("published_at, title, excerpt")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { error: "Could not publish the announcement." };
  if (!row) return { error: "Announcement not found." };
  if (!row.excerpt?.trim()) return { error: "Add an excerpt before publishing." };
  // statusPatch also clears the archive provenance, so publishing straight out
  // of `archived` does not leave the row claiming it is still archived.
  const patch = statusPatch(actor, "published");
  if (!row.published_at) patch.published_at = new Date().toISOString();
  const { data, error } = await admin
    .from("announcements")
    .update(patch)
    .eq("id", id)
    .in("status", ["draft", "in-review", "archived"])
    .select("id")
    .maybeSingle();
  if (error) return { error: "Could not publish the announcement." };
  if (!data) return { error: "This announcement is already published." };
  await recordActivity(actor, {
    type: "publish",
    action: "published announcement",
    entityType: "announcement",
    entityId: id,
    entityLabel: row.title,
  });
  revalidate();
  return { error: null };
}
