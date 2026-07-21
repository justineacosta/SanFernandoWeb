"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AnnouncementValues, ContentStatus, SessionUser } from "@/types";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
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
  date: z.string().trim().min(1, "Pick a date."),
  excerpt: z.string().trim().min(1, "Enter an excerpt."),
  urgent: z.boolean(),
  imageSrc: z.string().trim().nullable(),
  imageAlt: z.string().trim(),
});

function revalidate() {
  revalidatePath("/admin/news");
  revalidatePath("/announcements");
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
): Promise<SaveResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND, id: null };
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid values.", id: null };

  const admin = createSupabaseAdminClient();

  if (id) {
    const { data: updated, error } = await admin
      .from("announcements")
      .update({
        title: parsed.data.title,
        date: parsed.data.date,
        excerpt: parsed.data.excerpt,
        urgent: parsed.data.urgent,
        image_src: parsed.data.imageSrc,
        image_alt: parsed.data.imageAlt,
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) return { error: "Could not save the announcement.", id: null };
    if (!updated) return { error: "Announcement not found.", id: null };
    await recordActivity(actor, "updated announcement", "announcement", id, parsed.data.title);
    revalidate();
    return { error: null, id };
  }

  const { data: inserted, error } = await admin
    .from("announcements")
    .insert({
      title: parsed.data.title,
      date: parsed.data.date,
      excerpt: parsed.data.excerpt,
      urgent: parsed.data.urgent,
      image_src: parsed.data.imageSrc,
      image_alt: parsed.data.imageAlt,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !inserted) return { error: "Could not create the announcement.", id: null };
  await recordActivity(actor, "created announcement", "announcement", inserted.id, parsed.data.title);
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
  await recordActivity(actor, verb, "announcement", id, data.title);
  revalidate();
  return { error: null };
}

export async function submitAnnouncementForReview(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  return applyTransition(actor, id, ["draft"], { status: "in-review" }, "submitted announcement for review");
}

export async function returnAnnouncementToDraft(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  return applyTransition(actor, id, ["in-review"], { status: "draft" }, "returned announcement to draft");
}

export async function archiveAnnouncement(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  return applyTransition(
    actor,
    id,
    ["draft", "in-review", "published"],
    { status: "archived" },
    "archived announcement",
  );
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
  const patch: Record<string, unknown> = { status: "published" };
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
  await recordActivity(actor, "published announcement", "announcement", id, row.title);
  revalidate();
  return { error: null };
}
