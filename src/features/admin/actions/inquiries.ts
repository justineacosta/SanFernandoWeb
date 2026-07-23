"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { InquiryStatus, InquiryUpdateValues } from "@/types";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ActionResult {
  error: string | null;
}

const updateSchema = z.object({
  status: z.enum(["new", "in_progress", "answered", "closed"]),
  staffNote: z.string().trim().max(2000, "Please keep the note short."),
});

/**
 * Audit class per outcome, mirroring the complaints queue: the positive
 * terminal state files with `approve` and the negative one with `reject`, so a
 * SuperAdmin filtering the log by outcome sees every flow's decisions together.
 */
const AUDIT: Record<InquiryStatus, { type: "update" | "approve" | "reject"; action: string }> = {
  new: { type: "update", action: "reopened inquiry" },
  in_progress: { type: "update", action: "took up inquiry" },
  answered: { type: "approve", action: "answered inquiry" },
  closed: { type: "reject", action: "closed inquiry" },
};

/**
 * Move an inquiry through the inbox and save the staff note.
 *
 * Unlike the ticket queues this does not guard the transition in the WHERE
 * clause. There is no resident-visible state machine to protect and no
 * irreversible side effect at either end — an inquiry closed by mistake is
 * reopened by picking "New" again. Locking the order here would cost a staff
 * member the ability to correct themselves and buy nothing.
 *
 * There is deliberately no delete. Spam is closed, not erased: nobody should be
 * able to make a resident's message disappear with no record that it arrived.
 */
export async function updateInquiry(
  id: string,
  values: InquiryUpdateValues,
): Promise<ActionResult> {
  const actor = await checkPermission("handle-inquiries");
  if (!actor) return { error: NOT_FOUND };
  const parsed = updateSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid update." };
  }

  const admin = createSupabaseAdminClient();
  const answered = parsed.data.status === "answered" || parsed.data.status === "closed";
  const { data, error } = await admin
    .from("inquiries")
    .update({
      status: parsed.data.status,
      staff_note: parsed.data.staffNote,
      handled_by: actor.id,
      // Stamped only once the inquiry is off the queue — "handled at" is when it
      // stopped needing someone, not when it was last looked at.
      handled_at: answered ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("first_name, last_name, subject")
    .maybeSingle();
  if (error) return { error: "Could not save the inquiry." };
  if (!data) return { error: "That inquiry no longer exists." };

  const entry = AUDIT[parsed.data.status];
  await recordActivity(actor, {
    type: entry.type,
    action: entry.action,
    entityType: "inquiry",
    entityId: id,
    entityLabel: `${data.first_name} ${data.last_name}`,
    detail: parsed.data.staffNote || undefined,
  });
  revalidatePath("/admin/inquiries");
  return { error: null };
}
