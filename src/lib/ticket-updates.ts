import type {
  TicketAttachment,
  TicketKind,
  TicketStatus,
  TicketUpdateAuthorKind,
  TicketUpdateEntryType,
  TicketUpdateVisibility,
} from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** The status a freshly-filed ticket of each kind carries. Not uniform. */
export const TICKET_INTAKE_STATUS: Record<TicketKind, TicketStatus> = {
  application: "pending",
  appointment: "pending",
  complaint: "received",
  assistance: "pending",
};

/** Statuses from which no further transition is offered. */
export const TICKET_TERMINAL_STATUSES: Record<TicketKind, readonly TicketStatus[]> = {
  application: ["released", "rejected"],
  appointment: ["completed", "declined"],
  complaint: ["resolved", "dismissed"],
  assistance: ["granted", "declined"],
};

/**
 * Where a resident reply puts the ticket back. Deliberately NOT the intake
 * status: a ticket that has been reviewed and replied to is not "Pending", and
 * a status column should describe reality. The nav badge picks the reply up
 * through `replied_at` instead (see src/lib/notifications.ts).
 */
export const REPLY_RETURN_STATUS = "under-review" as const;

/** A resident may reply only while staff have actually asked for something. */
export function canReply(status: TicketStatus): boolean {
  return status === "awaiting-info";
}

export function isTerminalStatus(kind: TicketKind, status: TicketStatus): boolean {
  return TICKET_TERMINAL_STATUSES[kind].includes(status);
}

export interface StatusEntryCopy {
  title: string;
  detail: string;
}

/**
 * Default resident-facing wording for a machine-written status entry, used when
 * the transition carried no remarks of its own. Per-kind because the same
 * status word means different things: an application is "Approved — ready to
 * claim", an assistance request is "Granted".
 */
const STATUS_COPY: Record<TicketKind, Partial<Record<TicketStatus, StatusEntryCopy>>> = {
  application: {
    pending: { title: "Received", detail: "Your request reached the barangay office." },
    "under-review": { title: "Under review", detail: "Barangay staff are reviewing your request." },
    approved: { title: "Approved", detail: "Your document is ready to claim at the barangay hall." },
    released: { title: "Released", detail: "Claimed at the barangay hall." },
    rejected: { title: "Not approved", detail: "This request was not approved." },
  },
  appointment: {
    pending: { title: "Received", detail: "Your request reached the barangay office." },
    "under-review": { title: "Under review", detail: "Barangay staff are checking the schedule you asked for." },
    confirmed: { title: "Confirmed", detail: "Barangay staff confirmed your schedule." },
    completed: { title: "Completed", detail: "Thank you for coming in." },
    declined: { title: "Declined", detail: "This appointment was not granted." },
  },
  complaint: {
    received: { title: "Received", detail: "Your report reached the barangay office." },
    "under-review": { title: "Under review", detail: "The Lupong Tagapamayapa is looking into your report." },
    resolved: { title: "Resolved", detail: "This report has been settled." },
    dismissed: { title: "Dismissed", detail: "This report was closed without a settlement." },
  },
  assistance: {
    pending: { title: "Received", detail: "Your request reached the barangay office." },
    "under-review": { title: "Under review", detail: "The Barangay Social Welfare Desk is assessing your request." },
    granted: { title: "Granted", detail: "Your request was granted — barangay staff will contact you." },
    declined: { title: "Declined", detail: "This request was not granted." },
  },
};

/** Same for every kind: asking the resident for something reads identically. */
const AWAITING_INFO_COPY: StatusEntryCopy = {
  title: "More information needed",
  detail: "Barangay staff need something from you before this can move forward.",
};

export function statusEntryCopy(kind: TicketKind, status: TicketStatus): StatusEntryCopy {
  if (status === "awaiting-info") return AWAITING_INFO_COPY;
  return (
    STATUS_COPY[kind][status] ?? {
      title: "Updated",
      detail: "This request was updated.",
    }
  );
}

/**
 * One timeline entry. An options object rather than positional arguments, for
 * the same reason `AuditInput` is one: eleven fields is unreadable positionally.
 */
export interface TicketUpdateInput {
  ticketNo: string;
  kind: TicketKind;
  entryType: TicketUpdateEntryType;
  /** Only on entry_type 'status'. The status moved TO. */
  status?: TicketStatus | null;
  body?: string;
  visibility: TicketUpdateVisibility;
  authorKind: TicketUpdateAuthorKind;
  authorId?: string | null;
  authorName?: string | null;
  attachments?: TicketAttachment[];
}

/**
 * Append one row to the timeline log.
 *
 * Returns the new row's id, or null on failure. The status-transition callers
 * ignore the return value and are fire-and-forget by design — an audit-style
 * log failure must never roll back the decision it records. `postTicketUpdate`
 * DOES check it, because writing the row is that action's entire purpose.
 *
 * Deliberately shaped like `recordActivity` in src/lib/audit.ts so the two read
 * as siblings — but they are NOT merged. `audit_log` records staff actions for
 * accountability across every module; this is resident-facing content for one.
 */
export async function recordTicketUpdate(entry: TicketUpdateInput): Promise<string | null> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("ticket_updates")
      .insert({
        ticket_no: entry.ticketNo,
        ticket_kind: entry.kind,
        entry_type: entry.entryType,
        status: entry.status ?? null,
        body: entry.body ?? "",
        visibility: entry.visibility,
        author_kind: entry.authorKind,
        author_id: entry.authorId ?? null,
        author_name: entry.authorName ?? null,
        attachments: entry.attachments ?? [],
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("recordTicketUpdate failed:", error?.message);
      return null;
    }
    return data.id;
  } catch (cause) {
    console.error("recordTicketUpdate threw:", cause);
    return null;
  }
}

/**
 * Stamp `notified_at` after a resident email was attempted. Best-effort.
 *
 * The rule, and it is narrower than it looks: call this wherever an entry's
 * own action emailed **the resident**, immediately after the `sendEmail`, inside
 * the same `if (email)` guard — never unconditionally, because the chip it
 * raises reads "Email attempted" and a ticket with no email address on it was
 * never told anything. Guard on the id (`if (entryId)`) so a failed log insert
 * still cannot turn a decision into a failed action; `recordTicketUpdate` is
 * fire-and-forget for that same reason.
 *
 * Deliberately NOT called for: `releaseApplication` / `completeAppointment`
 * (non-terminal transitions the email design excludes on purpose — nothing was
 * sent, so nothing to stamp), and `submitTicketReply`'s own resident-reply
 * entry (that action emails STAFF, not the resident; stamping it would put an
 * "Email attempted" chip on the resident's own message and read as though the
 * barangay had already answered them).
 */
export async function markTicketUpdateNotified(id: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("ticket_updates")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error("markTicketUpdateNotified failed:", error.message);
}
