import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { type MediaKind, draftBucketFor, publicBucketFor } from "@/lib/storage";

/**
 * Copy every path in `paths` from `sourceBucket` to `destBucket`, leaving the
 * source untouched. Stops and reports the first failure — a partial copy is
 * the caller's problem to decide how to handle (see `promoteMedia` vs
 * `demoteMedia` below, which handle a failure very differently).
 */
async function copyObjects(
  sourceBucket: string,
  destBucket: string,
  paths: string[],
): Promise<{ error: string | null }> {
  const admin = createSupabaseAdminClient();
  for (const path of paths) {
    const { data: file, error: downloadErr } = await admin.storage
      .from(sourceBucket)
      .download(path);
    if (downloadErr || !file) {
      return { error: `Could not read ${path} from ${sourceBucket}.` };
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadErr } = await admin.storage
      .from(destBucket)
      .upload(path, buffer, { contentType: file.type || undefined, upsert: true });
    if (uploadErr) {
      return { error: `Could not write ${path} to ${destBucket}.` };
    }
  }
  return { error: null };
}

/** Best-effort remove — logs and swallows, never throws, never fails the caller. */
async function bestEffortRemove(bucket: string, paths: string[], context: string): Promise<void> {
  if (paths.length === 0) return;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(bucket).remove(paths);
  if (error) {
    console.error(`Orphaned storage objects (${context}): ${paths.join(", ")}`);
  }
}

/**
 * Called before flipping a record's status to "published". Copies every path
 * from `<kind>-drafts` to `<kind>-media`. Returns an error if ANY copy fails
 * — the caller MUST abort the publish rather than let the row read
 * "published" while its media still lives only in the private bucket, which
 * would surface a broken image on a live public page. Remote seed URLs
 * (`https://...`) are skipped — they were never uploaded to either bucket.
 */
export async function promoteMedia(
  kind: MediaKind,
  paths: string[],
): Promise<{ error: string | null }> {
  const owned = paths.filter((p) => !/^https?:\/\//i.test(p));
  if (owned.length === 0) return { error: null };
  const result = await copyObjects(draftBucketFor(kind), publicBucketFor(kind), owned);
  if (result.error) return result;
  await bestEffortRemove(draftBucketFor(kind), owned, `${kind} promote cleanup`);
  return { error: null };
}

/**
 * Called after a record's status has already flipped away from "published"
 * — specifically, only when archiving something that WAS published (see the
 * publish/archive wiring plan for exactly which transitions call this).
 * Copies every path back from `<kind>-media` to `<kind>-drafts`. Best-effort:
 * the row is already excluded from public listings by its status regardless
 * of whether this fully succeeds, so a failure is logged, not surfaced to
 * the user whose archive action already committed.
 */
export async function demoteMedia(
  kind: MediaKind,
  paths: string[],
  context: string,
): Promise<void> {
  const owned = paths.filter((p) => !/^https?:\/\//i.test(p));
  if (owned.length === 0) return;
  const result = await copyObjects(publicBucketFor(kind), draftBucketFor(kind), owned);
  if (result.error) {
    console.error(`Could not demote media (${context}): ${result.error}`);
    return;
  }
  await bestEffortRemove(publicBucketFor(kind), owned, context);
}
