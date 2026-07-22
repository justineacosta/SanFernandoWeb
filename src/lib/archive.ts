import type { ArchiveMeta, ContentStatus, SessionUser } from "@/types";
import { NOT_FOUND, checkSuperAdmin } from "@/lib/auth";
import { toManilaDate } from "@/lib/format";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Archive, restore, and the gate on permanent deletion.
 *
 * Umbrella spec §3.2: archive is a soft delete anyone with the module
 * permission may perform; **delete is permanent, SuperAdmin-only, and reachable
 * only from a record that is already archived.** Before this module every
 * content delete sat behind `checkPermission(<module>)` alone and ignored the
 * record's status, so one click could erase a published ordinance and its PDF.
 *
 * The two conditions matter as a pair. SuperAdmin alone still allows a mis-click
 * on a live record; archived-only alone still lets any editor purge one.
 */

export const ARCHIVE_FIRST =
  "Archive this record first. Only archived records can be deleted permanently.";

/**
 * The status half of any content-status update, with archive provenance
 * attached (migration 0020).
 *
 * Keyed off the *target* status rather than being bolted onto the archive
 * actions, because `setOfficialStatus` and `setLegislativeStatus` drive the
 * whole draft → published → archived cycle through one entry point. Leaving on
 * any other status clears the columns, so a record brought back does not keep
 * claiming it is archived.
 *
 * Restoring targets `draft`, never `published`: restoring means "take this out
 * of the bin", not "put it back on the website". The click that undoes a
 * mistake must not be able to make one — republishing stays a separate,
 * deliberate step through the editor that already exists.
 */
export function statusPatch(actor: SessionUser, next: ContentStatus): Record<string, unknown> {
  if (next === "archived") {
    return { status: next, archived_at: new Date().toISOString(), archived_by: actor.id };
  }
  return { status: next, archived_at: null, archived_by: null };
}

/**
 * `ok` is an explicit discriminant rather than a truthiness check on `error`:
 * `string | null` does not narrow a union, so `if (guard.error)` would leave
 * `actor` possibly null in every caller.
 */
/* ── Read side: showing who archived a record, and when ───────────────────── */

/**
 * Append to any admin list query's `.select()` to pick up archive provenance.
 * The name comes through the foreign key rather than a denormalised column —
 * see `InquiryRow.handledByName` for the same trade-off.
 */
export const ARCHIVE_SELECT = "archived_at, archived_by_profile:archived_by (full_name)";

/** The two columns as PostgREST returns them. */
export interface ArchiveMetaRow {
  archived_at: string | null;
  // supabase-js types every embed as an array; a many-to-one FK returns one row.
  archived_by_profile: { full_name: string } | null;
}

/** Map a row's archive columns onto the shape the admin tables render. */
export function toArchiveMeta(row: ArchiveMetaRow): ArchiveMeta {
  return {
    archivedAt: row.archived_at ? toManilaDate(row.archived_at) : null,
    archivedByName: row.archived_by_profile?.full_name ?? null,
  };
}

type GuardResult<T> = { ok: true; actor: SessionUser; row: T } | { ok: false; error: string };

/**
 * The delete gate. Returns the actor and the row only when the caller may go
 * ahead; otherwise the message to hand back to the client.
 *
 * `columns` are the caller's own cleanup columns (file paths, slugs, labels) —
 * they are appended to the status read so a delete still costs one query. The
 * status check lives here rather than in each action because a Server Action is
 * a public HTTP endpoint: a stale tab or a replayed request reaches it directly,
 * and a check that has to be remembered seven times is a check that will be
 * forgotten once.
 */
export async function guardDelete<T = Record<string, unknown>>(
  table: string,
  id: string,
  columns: string,
): Promise<GuardResult<T>> {
  const actor = await checkSuperAdmin();
  if (!actor) return { ok: false, error: NOT_FOUND };

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from(table)
    .select(`status, ${columns}`)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error(`guardDelete read failed on ${table}:`, error.message);
    return { ok: false, error: "Could not check that record." };
  }
  // The cast is unavoidable: supabase-js resolves `.select()` at the type level
  // from a string literal, and `columns` is only known at runtime.
  const row = data as unknown as (T & { status: string }) | null;
  if (!row) return { ok: false, error: "That record no longer exists." };
  if (row.status !== "archived") return { ok: false, error: ARCHIVE_FIRST };

  return { ok: true, actor, row };
}
