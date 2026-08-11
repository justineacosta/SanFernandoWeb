import type { TicketAttachment, TicketKind } from "@/types";
import { discardTicketAttachment, uploadTicketAttachment } from "@/lib/media";
import {
  ALLOWED_DOC_FILE_TYPES,
  MAX_TICKET_FILES,
  MAX_TICKET_FILE_BYTES,
  sniffMimeType,
} from "@/lib/storage";
import { TICKET_INTAKE_STATUS, recordTicketUpdate } from "@/lib/ticket-updates";

/**
 * Shown when a ticket was filed but its attachments were not. Reachable only
 * through a genuine storage or timeline failure — everything the resident can
 * fix is rejected by `validateTicketFiles` before any row exists.
 *
 * It deliberately does not tell the resident to reply on /track as something
 * they can do right now: `canReply()` opens the reply form only on
 * `awaiting-info`, and every intake status (`pending`, `received`) is earlier
 * than that, so the instruction would be false the instant this can show.
 */
export const TICKET_ATTACHMENT_WARNING =
  "We could not attach your files. Your request is filed — bring them to the barangay hall, or send them through /track once staff ask for more information.";

/**
 * The pre-insert gate. Every rejection here is something the submitter can fix,
 * which is exactly why it runs before any row is written: a bad file must not
 * cost anyone a ticket number, and the post-insert warning path stays reserved
 * for failures they had no part in.
 *
 * Returns the message to show, or null when the files are acceptable.
 */
export async function validateTicketFiles(files: File[]): Promise<string | null> {
  if (files.length > MAX_TICKET_FILES) {
    return `You can attach up to ${MAX_TICKET_FILES} files.`;
  }
  for (const file of files) {
    if (!ALLOWED_DOC_FILE_TYPES.includes(file.type as (typeof ALLOWED_DOC_FILE_TYPES)[number])) {
      return "Attachments must be JPG, PNG, WebP, or PDF.";
    }
    if (file.size > MAX_TICKET_FILE_BYTES) {
      return "Each attachment must be 2 MB or smaller.";
    }
    // Bytes, not just the declared type. Checked here rather than only inside
    // uploadTicketAttachment because a mismatch is submitter-fixable and belongs
    // in this gate. Same message as the declared-type rejection above,
    // deliberately: a prober must not learn which of the two they tripped.
    const buffer = Buffer.from(await file.arrayBuffer());
    if (sniffMimeType(buffer) !== file.type) {
      return "Attachments must be JPG, PNG, WebP, or PDF.";
    }
  }
  return null;
}

export interface IntakeAttachmentsInput {
  /** DB-resolved, never a client string — it becomes a storage path prefix. */
  ticketNo: string;
  kind: TicketKind;
  files: File[];
  /** Set for walk-in encoding; absent for a resident's own submission. */
  authorName?: string;
  /** Identifies the caller in orphan logs, e.g. "submitApplication". */
  context: string;
}

/**
 * Upload the attachments, then write the intake timeline entry that references
 * them. The single owner of the ordering rules every caller depends on:
 *
 * - Uploads run after the row insert, because the path is `<ticket_no>/<uuid>`.
 * - A storage failure never fails the submission. The ticket is already the
 *   submitter's; failing here would send them back for a second number. Every
 *   object uploaded so far is discarded and the caller returns a warning.
 * - A `recordTicketUpdate` failure discards the uploads too — otherwise a
 *   resident's ID sits in a private bucket referenced by no row at all, which
 *   breaks the one invariant every upload path in this codebase keeps.
 */
export async function recordIntakeWithAttachments({
  ticketNo,
  kind,
  files,
  authorName,
  context,
}: IntakeAttachmentsInput): Promise<{ entryId: string | null; attachmentWarning: string | null }> {
  const uploaded: TicketAttachment[] = [];
  let attachmentWarning: string | null = null;

  for (const file of files) {
    const result = await uploadTicketAttachment(file, ticketNo);
    if (result.error || !result.src) {
      for (const done of uploaded) {
        await discardTicketAttachment(done.path, `${context} upload failed`);
      }
      uploaded.length = 0;
      attachmentWarning = TICKET_ATTACHMENT_WARNING;
      break;
    }
    uploaded.push({ path: result.src, name: file.name, mime: file.type, sizeBytes: file.size });
  }

  const entryId = await recordTicketUpdate({
    ticketNo,
    kind,
    entryType: "status",
    status: TICKET_INTAKE_STATUS[kind],
    visibility: "public",
    authorKind: "system",
    authorName,
    attachments: uploaded,
  });

  if (!entryId && uploaded.length > 0) {
    for (const done of uploaded) {
      await discardTicketAttachment(done.path, `${context} timeline insert failed`);
    }
    attachmentWarning = TICKET_ATTACHMENT_WARNING;
  }

  return { entryId, attachmentWarning };
}
