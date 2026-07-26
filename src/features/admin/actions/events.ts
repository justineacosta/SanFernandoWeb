"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AuditActionType, ContentStatus, EventValues, SessionUser } from "@/types";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { guardDelete, statusPatch } from "@/lib/archive";
import { recordActivity } from "@/lib/audit";
import { discardImage, removeStoredImage, uploadSingleImage } from "@/lib/media";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getEventForEdit } from "@/features/admin/queries/events";

export interface ActionResult {
  error: string | null;
}
export interface SaveResult {
  error: string | null;
  id: string | null;
}

const EVENT_CATEGORIES = [
  "town-hall",
  "health-drive",
  "festival",
  "youth",
  "environment",
  "community",
] as const;

const schema = z.object({
  title: z.string().trim().min(3, "Enter a title."),
  category: z.enum(EVENT_CATEGORIES),
  eventDate: z.string().trim().min(1, "Pick a date."),
  startTime: z.string().trim().min(1, "Enter a start time."),
  endTime: z.string(),
  venue: z.string().trim().min(1, "Enter a venue."),
  capacity: z.number().nullable(),
  description: z.string(),
  coverSrc: z.string().trim().nullable(),
  coverAlt: z.string().trim(),
});

function revalidate() {
  revalidatePath("/admin/events");
  revalidatePath("/events");
  revalidatePath("/");
}

/**
 * Client-callable counterpart to `getEventForEdit` (which is `server-only`
 * and so cannot be imported into the "use client" manager). The manager
 * fetches full editable detail only when a drawer is opened for editing.
 */
export async function getEventForEditAction(
  id: string,
): Promise<{ values: EventValues; status: ContentStatus } | null> {
  if (!(await checkPermission("manage-news"))) return null;
  return getEventForEdit(id);
}

export async function saveEvent(
  id: string | null,
  values: EventValues,
  coverForm: FormData,
): Promise<SaveResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND, id: null };
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid values.", id: null };

  const admin = createSupabaseAdminClient();

  // Upload first, then compensate on any later failure — see saveAnnouncement.
  const incoming = coverForm.get("image");
  const removeCover = coverForm.get("removeImage") === "1";
  let uploadedPath: string | null = null;
  if (incoming instanceof File && incoming.size > 0) {
    const uploaded = await uploadSingleImage("events", incoming);
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

  const nextCoverSrc = uploadedPath ?? (removeCover ? null : parsed.data.coverSrc);
  const nextCoverAlt = nextCoverSrc ? parsed.data.coverAlt : "";

  if (id) {
    const { data: existing, error: readErr } = await admin
      .from("events")
      .select("cover_src")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return fail("Could not save the event.");
    if (!existing) return fail("Event not found.");

    const { data: updated, error } = await admin
      .from("events")
      .update({
        title: parsed.data.title,
        category: parsed.data.category,
        event_date: parsed.data.eventDate,
        start_time: parsed.data.startTime,
        end_time: parsed.data.endTime,
        venue: parsed.data.venue,
        capacity: parsed.data.capacity,
        description: parsed.data.description,
        cover_src: nextCoverSrc,
        cover_alt: nextCoverAlt,
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) return fail("Could not save the event.");
    if (!updated) return fail("Event not found.");

    const previous = existing.cover_src as string | null;
    if (previous && previous !== nextCoverSrc) {
      await discardImage(previous, "event cover replaced");
    }
    await recordActivity(actor, {
      type: "update",
      action: "updated event",
      entityType: "event",
      entityId: id,
      entityLabel: parsed.data.title,
    });
    revalidate();
    return { error: null, id };
  }

  const { data: inserted, error } = await admin
    .from("events")
    .insert({
      title: parsed.data.title,
      category: parsed.data.category,
      event_date: parsed.data.eventDate,
      start_time: parsed.data.startTime,
      end_time: parsed.data.endTime,
      venue: parsed.data.venue,
      capacity: parsed.data.capacity,
      description: parsed.data.description,
      cover_src: nextCoverSrc,
      cover_alt: nextCoverAlt,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !inserted) return fail("Could not create the event.");
  await recordActivity(actor, {
    type: "create",
    action: "created event",
    entityType: "event",
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
    .from("events")
    .update(patch)
    .eq("id", id)
    .in("status", from)
    .select("id, title")
    .maybeSingle();
  if (error) return { error: "Could not update the event." };
  if (!data) return { error: "This event is no longer in a state that allows that action." };
  await recordActivity(actor, { type, action: verb, entityType: "event", entityId: id, entityLabel: data.title });
  revalidate();
  return { error: null };
}

export async function submitEventForReview(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  return applyTransition(actor, id, ["draft"], { status: "in-review" }, "update", "submitted event for review");
}

export async function returnEventToDraft(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  return applyTransition(actor, id, ["in-review"], { status: "draft" }, "save_draft", "returned event to draft");
}

export async function archiveEvent(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  return applyTransition(
    actor,
    id,
    ["draft", "in-review", "published"],
    statusPatch(actor, "archived"),
    "archive",
    "archived event",
  );
}

/** Bring an archived event back as a draft — not straight back onto the calendar. */
export async function restoreEvent(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  return applyTransition(
    actor,
    id,
    ["archived"],
    statusPatch(actor, "draft"),
    "restore",
    "restored event",
  );
}

/**
 * Hard delete — SuperAdmin only, and only from `archived` (umbrella §3.2).
 * Deferred out of sub-project 6 along with the rest of the storage lifecycle.
 */
export async function deleteEvent(id: string): Promise<ActionResult> {
  const guard = await guardDelete<{ title: string; cover_src: string | null }>(
    "events",
    id,
    "title, cover_src",
  );
  if (!guard.ok) return { error: guard.error };
  const { actor, row: existing } = guard;

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("events").delete().eq("id", id);
  if (error) return { error: "Could not delete the event." };

  await discardImage(existing.cover_src, "event deleted");
  await recordActivity(actor, {
    type: "delete",
    action: "deleted event",
    entityType: "event",
    entityId: id,
    entityLabel: existing.title,
  });
  revalidate();
  return { error: null };
}

/** Publish; set published_at only on first publish so re-publishing an archived event doesn't bump it. */
export async function publishEvent(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  const admin = createSupabaseAdminClient();
  const { data: row, error: readErr } = await admin
    .from("events")
    .select("published_at, title, event_date, start_time, venue")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { error: "Could not publish the event." };
  if (!row) return { error: "Event not found." };
  if (!row.title?.trim() || !row.event_date || !row.start_time?.trim() || !row.venue?.trim()) {
    return { error: "Add a title, date, start time, and venue before publishing." };
  }
  // statusPatch also clears the archive provenance, so publishing straight out
  // of `archived` does not leave the row claiming it is still archived.
  const patch = statusPatch(actor, "published");
  if (!row.published_at) patch.published_at = new Date().toISOString();
  const { data, error } = await admin
    .from("events")
    .update(patch)
    .eq("id", id)
    .in("status", ["draft", "in-review", "archived"])
    .select("id")
    .maybeSingle();
  if (error) return { error: "Could not publish the event." };
  if (!data) return { error: "This event is already published." };
  await recordActivity(actor, {
    type: "publish",
    action: "published event",
    entityType: "event",
    entityId: id,
    entityLabel: row.title,
  });
  revalidate();
  return { error: null };
}
