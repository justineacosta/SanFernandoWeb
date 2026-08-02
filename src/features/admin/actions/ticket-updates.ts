"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AdminTicketUpdate, Permission, TicketKind, TicketStatus, TicketUpdateValues } from "@/types";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { TicketUpdateEmail } from "@/emails/TicketUpdateEmail";
import { isTerminalStatus, markTicketUpdateNotified, recordTicketUpdate } from "@/lib/ticket-updates";
import { listTicketUpdates } from "@/features/admin/queries/ticket-updates";

export interface ActionResult {
  error: string | null;
}

/** Per-kind table, permission, manager path and email wording. One registry, four flows. */
const KINDS: Record<
  TicketKind,
  { table: string; permission: Permission; path: string; label: string; entity: string }
> = {
  application: {
    table: "applications",
    permission: "process-applications",
    path: "/admin/applications",
    label: "certificate application",
    entity: "application",
  },
  appointment: {
    table: "appointments",
    permission: "process-appointments",
    path: "/admin/appointments",
    label: "appointment request",
    entity: "appointment",
  },
  complaint: {
    table: "complaints",
    permission: "handle-complaints",
    path: "/admin/complaints",
    label: "incident report",
    entity: "complaint",
  },
  assistance: {
    table: "assistance_requests",
    permission: "handle-assistance",
    path: "/admin/assistance",
    label: "assistance request",
    entity: "assistance",
  },
};

const schema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write the update.")
    .max(2000, "Please keep the update under 2000 characters."),
  visibility: z.enum(["public", "internal"]),
  notify: z.boolean(),
  setStatus: z.union([z.literal("under-review"), z.literal("awaiting-info"), z.null()]),
});

/**
 * Post one staff update to a ticket's timeline, optionally moving it to
 * `under-review` or `awaiting-info` and optionally emailing the resident.
 *
 * It NEVER writes the reviewed_, closed_, released_, or decided_ columns, or
 * `remarks` — those belong to the decision actions and record who decided
 * what, when.
 * Moving a ticket to `under-review` is not a decision.
 */
export async function postTicketUpdate(
  kind: TicketKind,
  id: string,
  values: TicketUpdateValues,
): Promise<ActionResult> {
  const def = KINDS[kind];
  const actor = await checkPermission(def.permission);
  if (!actor) return { error: NOT_FOUND };

  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid update." };
  }

  // Asking for information the resident cannot see is incoherent. The UI locks
  // the radio; this re-checks rather than trusting the client.
  const visibility =
    parsed.data.setStatus === "awaiting-info" ? "public" : parsed.data.visibility;
  // An internal note has no resident to notify, whatever the client sent.
  const notify = visibility === "public" && parsed.data.notify;

  const admin = createSupabaseAdminClient();
  const { data: ticket, error: loadError } = await admin
    .from(def.table)
    .select("ticket_no, status, email, first_name")
    .eq("id", id)
    .maybeSingle();
  if (loadError) return { error: "Could not load that ticket." };
  if (!ticket) return { error: NOT_FOUND };

  const current = ticket.status as TicketStatus;
  if (isTerminalStatus(kind, current)) {
    return { error: "That ticket is already closed. Refresh to see its status." };
  }

  const entryId = await recordTicketUpdate({
    ticketNo: ticket.ticket_no,
    kind,
    entryType: parsed.data.setStatus === "awaiting-info" ? "info-request" : "staff-note",
    status: null,
    body: parsed.data.body,
    visibility,
    authorKind: "staff",
    authorId: actor.id,
    authorName: actor.fullName,
  });
  if (!entryId) return { error: "Could not save the update." };

  if (parsed.data.setStatus) {
    // Guard the transition in the WHERE clause: a stale tab must not move a
    // ticket someone else has since decided.
    //
    // A 0-row match is NOT an error in PostgREST, so checking `error` alone
    // would let a concurrent decision silently no-op while this action went on
    // to email the resident about a transition that never happened. Same
    // `.select().maybeSingle()` + `if (!data)` shape reviewApplication uses.
    const { data: moved, error: statusError } = await admin
      .from(def.table)
      .update({ status: parsed.data.setStatus, replied_at: null })
      .eq("id", id)
      .eq("status", current)
      .select("id")
      .maybeSingle();
    if (statusError) return { error: "Could not update the status." };
    if (!moved) {
      return { error: "That ticket changed while you were editing. Refresh to see its status." };
    }
    await recordTicketUpdate({
      ticketNo: ticket.ticket_no,
      kind,
      entryType: "status",
      status: parsed.data.setStatus,
      visibility: "public",
      authorKind: "system",
      authorName: actor.fullName,
    });
  } else {
    // Staff have responded; the reply is no longer unread.
    await admin.from(def.table).update({ replied_at: null }).eq("id", id);
  }

  if (notify && ticket.email) {
    await sendEmail({
      to: ticket.email,
      subject:
        parsed.data.setStatus === "awaiting-info"
          ? `We need more information — ${ticket.ticket_no}`
          : `Update on your request — ${ticket.ticket_no}`,
      template: TicketUpdateEmail({
        firstName: ticket.first_name,
        ticketNo: ticket.ticket_no,
        kindLabel: def.label,
        body: parsed.data.body,
        needsInfo: parsed.data.setStatus === "awaiting-info",
      }),
    });
    await markTicketUpdateNotified(entryId);
  }

  await recordActivity(actor, {
    type: "update",
    action:
      parsed.data.setStatus === "awaiting-info"
        ? `requested information on ${def.entity}`
        : `posted ${visibility === "internal" ? "internal note" : "update"} on ${def.entity}`,
    entityType: def.entity,
    entityId: ticket.ticket_no,
    entityLabel: ticket.ticket_no,
  });

  revalidatePath(def.path);
  return { error: null };
}

/**
 * Fetch one ticket's full timeline for the admin review drawer. Permission is
 * checked against the same registry `postTicketUpdate` uses — a caller who
 * cannot act on a queue cannot read its internal notes either.
 */
export async function getTicketUpdatesAction(
  kind: TicketKind,
  ticketNo: string,
): Promise<AdminTicketUpdate[]> {
  const actor = await checkPermission(KINDS[kind].permission);
  if (!actor) return [];
  return listTicketUpdates(ticketNo);
}
