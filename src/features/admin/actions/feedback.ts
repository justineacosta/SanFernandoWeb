"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FeedbackStatus, FeedbackUpdateValues } from "@/types";
import { NOT_FOUND, checkPermission, checkSuperAdmin } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { discardFeedbackScreenshot } from "@/lib/media";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ActionResult {
  error: string | null;
}

const updateSchema = z.object({
  status: z.enum(["new", "in_progress", "resolved", "dismissed"]),
  staffNote: z.string().trim().max(2000, "Please keep the note short."),
});

/**
 * Audit class per outcome, following the inquiry inbox's convention so a
 * SuperAdmin filtering the log by outcome sees every queue's decisions together.
 */
const AUDIT: Record<FeedbackStatus, { type: "update" | "approve" | "reject"; action: string }> = {
  new: { type: "update", action: "reopened feedback" },
  in_progress: { type: "update", action: "took up feedback" },
  resolved: { type: "approve", action: "resolved feedback" },
  dismissed: { type: "reject", action: "dismissed feedback" },
};

/**
 * Move a feedback report through the queue and save the triage note.
 *
 * No transition guard, like the inquiry inbox: there is no resident-visible
 * state machine to protect and nothing irreversible at either end, so a report
 * dismissed by mistake is recovered by picking "New" again.
 */
export async function updateFeedback(
  id: string,
  values: FeedbackUpdateValues,
): Promise<ActionResult> {
  const actor = await checkPermission("handle-inquiries");
  if (!actor) return { error: NOT_FOUND };
  const parsed = updateSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid update." };
  }

  const admin = createSupabaseAdminClient();
  const settled = parsed.data.status === "resolved" || parsed.data.status === "dismissed";
  const { data, error } = await admin
    .from("feedback")
    .update({
      status: parsed.data.status,
      staff_note: parsed.data.staffNote,
      handled_by: actor.id,
      // Stamped only once the report is off the queue — "handled at" is when it
      // stopped needing someone, not when it was last looked at.
      handled_at: settled ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("subject")
    .maybeSingle();
  if (error) return { error: "Could not save the feedback." };
  if (!data) return { error: "That feedback no longer exists." };

  const entry = AUDIT[parsed.data.status];
  await recordActivity(actor, {
    type: entry.type,
    action: entry.action,
    entityType: "feedback",
    entityId: id,
    entityLabel: data.subject,
    detail: parsed.data.staffNote || undefined,
  });
  revalidatePath("/admin/inquiries");
  return { error: null };
}

/**
 * Permanently delete one dismissed report and its screenshot.
 *
 * Two conditions, both enforced here and neither taken on the UI's word:
 * **SuperAdmin**, and the row must already be `dismissed`. That is
 * `guardDelete()`'s shape, deliberately reimplemented rather than reused —
 * `guardDelete` keys on `archived`, and feedback has no archive lifecycle, so
 * `dismissed` plays that part.
 *
 * Feedback has a delete where inquiries do not, and the difference is the point:
 * this endpoint is anonymous and accepts image uploads, so spam needs a janitor.
 * A named resident's message must never be erasable.
 */
export async function deleteFeedback(id: string): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };

  const admin = createSupabaseAdminClient();
  const { data: existing, error: readError } = await admin
    .from("feedback")
    .select("status, subject, screenshot_path")
    .eq("id", id)
    .maybeSingle();
  if (readError) return { error: "Could not load that feedback." };
  if (!existing) return { error: "That feedback no longer exists." };
  if (existing.status !== "dismissed") {
    return { error: "Dismiss the feedback first — only dismissed reports can be deleted." };
  }

  const { error } = await admin.from("feedback").delete().eq("id", id);
  if (error) return { error: "Could not delete the feedback." };

  // After the row, never before: an orphaned object is a logged nuisance, a
  // deleted file with a surviving row is a broken record.
  await discardFeedbackScreenshot(existing.screenshot_path, `deleteFeedback ${id}`);

  await recordActivity(actor, {
    type: "delete",
    action: "deleted feedback",
    entityType: "feedback",
    entityId: id,
    entityLabel: existing.subject,
  });
  revalidatePath("/admin/inquiries");
  return { error: null };
}
