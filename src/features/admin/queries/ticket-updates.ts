import type { AdminTicketUpdate, TicketAttachment, TicketStatus } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toManilaDate } from "@/lib/format";
import { TICKET_MEDIA_BUCKET } from "@/lib/storage";

/** Ten minutes: long enough to open an attachment, short enough to be worthless if leaked. */
const SIGNED_URL_TTL_SECONDS = 600;

/**
 * The full timeline for one ticket, INCLUDING internal notes. Uses the
 * service-role client because `ticket_updates` has no RLS policies — callers
 * MUST have checked the queue's permission first (postTicketUpdate and the
 * manager pages do).
 *
 * Attachments are signed in ONE batch for the whole timeline rather than per
 * row, the same reasoning `listFeedback` documents: a long thread must not
 * become one round trip per file.
 */
export async function listTicketUpdates(ticketNo: string): Promise<AdminTicketUpdate[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("ticket_updates")
    .select(
      "id, entry_type, status, body, visibility, author_kind, author_name, attachments, notified_at, created_at",
    )
    .eq("ticket_no", ticketNo)
    .order("created_at", { ascending: true });
  if (error || !data) {
    if (error) console.error("listTicketUpdates failed:", error.message);
    return [];
  }

  const paths = data.flatMap((row) =>
    ((row.attachments ?? []) as TicketAttachment[]).map((file) => file.path),
  );

  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls, error: signError } = await admin.storage
      .from(TICKET_MEDIA_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    // A signing failure must not empty the timeline — the entry still matters
    // without its file, so the attachment renders with url null.
    if (signError) console.error("listTicketUpdates could not sign attachments:", signError.message);
    for (const entry of urls ?? []) {
      if (entry.signedUrl && entry.path) signed.set(entry.path, entry.signedUrl);
    }
  }

  return data.map((row) => ({
    id: row.id,
    entryType: row.entry_type as AdminTicketUpdate["entryType"],
    status: (row.status as TicketStatus | null) ?? null,
    body: row.body,
    visibility: row.visibility as AdminTicketUpdate["visibility"],
    authorKind: row.author_kind as AdminTicketUpdate["authorKind"],
    authorName: row.author_name,
    attachments: ((row.attachments ?? []) as TicketAttachment[]).map((file) => ({
      ...file,
      url: signed.get(file.path) ?? null,
    })),
    notified: row.notified_at !== null,
    createdAt: toManilaDate(row.created_at),
  }));
}
