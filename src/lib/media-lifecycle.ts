import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { type MediaKind, draftBucketFor, mediaUrl, publicBucketFor } from "@/lib/storage";
import type { ContentStatus } from "@/types";

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
      return {
        error: `Could not read ${path} from ${sourceBucket}: ${downloadErr?.message ?? "not found"}`,
      };
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadErr } = await admin.storage
      .from(destBucket)
      .upload(path, buffer, { contentType: file.type || undefined, upsert: true });
    if (uploadErr) {
      return { error: `Could not write ${path} to ${destBucket}: ${uploadErr.message}` };
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
    console.error(
      `Orphaned storage objects (${context}): ${paths.join(", ")} — ${error.message}`,
    );
  }
}

/**
 * Called before flipping a record's status to "published". Copies every path
 * from `<kind>-drafts` to `<kind>-media`, leaving the `-drafts` source in
 * place. Returns an error if ANY copy fails — the caller MUST abort the
 * publish rather than let the row read "published" while its media still
 * lives only in the private bucket, which would surface a broken image on a
 * live public page. Remote seed URLs (`https://...`) are skipped — they were
 * never uploaded to either bucket.
 *
 * This function deliberately deletes NOTHING. The caller's next step is the
 * DB status update, and only once that update has actually committed may it
 * call `cleanupPromotedMedia` with the same paths. Deleting the `-drafts`
 * source any earlier would leave the object public — and, since a `-media`
 * bucket is anonymously enumerable, discoverable — with no private copy left
 * to retry from, should the status update fail or no-op (a concurrent status
 * change, say).
 */
export async function promoteMedia(
  kind: MediaKind,
  paths: string[],
): Promise<{ error: string | null }> {
  const owned = paths.filter((p) => !/^https?:\/\//i.test(p));
  if (owned.length === 0) return { error: null };
  return copyObjects(draftBucketFor(kind), publicBucketFor(kind), owned);
}

/**
 * The second half of a publish, run ONLY after `promoteMedia` succeeded AND
 * the DB status update that followed it committed. Best-effort removes the
 * now-redundant copies left behind in `<kind>-drafts`: the live record reads
 * from `<kind>-media` from here on, so a failure here costs an orphaned
 * private object, not a broken page — it is logged, never surfaced.
 */
export async function cleanupPromotedMedia(
  kind: MediaKind,
  paths: string[],
  context: string,
): Promise<void> {
  const owned = paths.filter((p) => !/^https?:\/\//i.test(p));
  if (owned.length === 0) return;
  await bestEffortRemove(draftBucketFor(kind), owned, context);
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

/** Ten minutes: long enough to open a preview, short enough to be worthless if leaked — matches `listFeedback`'s convention. */
const SIGNED_URL_TTL_SECONDS = 600;

/**
 * Resolve one stored path to a URL an admin editor can render. Published
 * content resolves to the plain public URL (no round trip); anything else
 * mints a short-lived signed URL against the private drafts bucket, since
 * that bucket has no public-read policy. A full remote seed URL passes
 * through unchanged either way.
 *
 * This does not gate who may call it — the existing `checkPermission(...)`
 * check on the admin action/query that calls this is what decides that. This
 * function only decides how to fetch the bytes once that check has passed.
 */
export async function resolveMediaUrl(
  kind: MediaKind,
  status: ContentStatus,
  path: string,
): Promise<string | null> {
  if (/^https?:\/\//i.test(path)) return path;
  if (status === "published") return mediaUrl(publicBucketFor(kind), path);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(draftBucketFor(kind))
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Batch form of `resolveMediaUrl` for a record with multiple files (news
 * photos, achievement photos, transparency files) — signs every owned path
 * in one Storage call instead of one round trip per file, mirroring
 * `listFeedback`'s `createSignedUrls` batch pattern.
 */
export async function resolveMediaUrls(
  kind: MediaKind,
  status: ContentStatus,
  paths: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const remote = paths.filter((p) => /^https?:\/\//i.test(p));
  for (const p of remote) result.set(p, p);

  const owned = paths.filter((p) => !/^https?:\/\//i.test(p));
  if (owned.length === 0) return result;

  if (status === "published") {
    for (const p of owned) result.set(p, mediaUrl(publicBucketFor(kind), p));
    return result;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(draftBucketFor(kind))
    .createSignedUrls(owned, SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.error(`resolveMediaUrls signing failed (${kind}):`, error.message);
    return result;
  }
  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) result.set(entry.path, entry.signedUrl);
  }
  return result;
}
