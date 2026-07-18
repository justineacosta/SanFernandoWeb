"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ContentStatus, EventValues, SessionUser } from "@/types";
import { requirePermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
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
  await requirePermission("manage-news");
  return getEventForEdit(id);
}

export async function saveEvent(id: string | null, values: EventValues): Promise<SaveResult> {
  const actor = await requirePermission("manage-news");
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid values.", id: null };

  const admin = createSupabaseAdminClient();

  if (id) {
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
        cover_src: parsed.data.coverSrc,
        cover_alt: parsed.data.coverAlt,
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) return { error: "Could not save the event.", id: null };
    if (!updated) return { error: "Event not found.", id: null };
    await recordActivity(actor, "updated event", "event", id, parsed.data.title);
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
      cover_src: parsed.data.coverSrc,
      cover_alt: parsed.data.coverAlt,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !inserted) return { error: "Could not create the event.", id: null };
  await recordActivity(actor, "created event", "event", inserted.id, parsed.data.title);
  revalidate();
  return { error: null, id: inserted.id };
}

/**
 * Apply a status transition. The `from` set is enforced inside the UPDATE's
 * WHERE (not a read-then-write) so a concurrent transition can't race past
 * this check. `actor` is resolved by the caller so that every exported
 * action's own first statement is the `requirePermission` gate.
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
    .from("events")
    .update(patch)
    .eq("id", id)
    .in("status", from)
    .select("id, title")
    .maybeSingle();
  if (error) return { error: "Could not update the event." };
  if (!data) return { error: "This event is no longer in a state that allows that action." };
  await recordActivity(actor, verb, "event", id, data.title);
  revalidate();
  return { error: null };
}

export async function submitEventForReview(id: string): Promise<ActionResult> {
  const actor = await requirePermission("manage-news");
  return applyTransition(actor, id, ["draft"], { status: "in-review" }, "submitted event for review");
}

export async function returnEventToDraft(id: string): Promise<ActionResult> {
  const actor = await requirePermission("manage-news");
  return applyTransition(actor, id, ["in-review"], { status: "draft" }, "returned event to draft");
}

export async function archiveEvent(id: string): Promise<ActionResult> {
  const actor = await requirePermission("manage-news");
  return applyTransition(
    actor,
    id,
    ["draft", "in-review", "published"],
    { status: "archived" },
    "archived event",
  );
}

/** Publish; set published_at only on first publish so re-publishing an archived event doesn't bump it. */
export async function publishEvent(id: string): Promise<ActionResult> {
  const actor = await requirePermission("manage-news");
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
  const patch: Record<string, unknown> = { status: "published" };
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
  await recordActivity(actor, "published event", "event", id, row.title);
  revalidate();
  return { error: null };
}
