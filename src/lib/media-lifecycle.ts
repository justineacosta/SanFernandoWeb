import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  type MediaKind,
  bucketForStatus,
  draftBucketFor,
  mediaUrl,
  publicBucketFor,
} from "@/lib/storage";
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
 * — on any transition that leaves published (archive, or a direct
 * published → draft/in-review write), not only archiving. Copies every
 * path back from `<kind>-media` to `<kind>-drafts`. Best-effort:
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

/**
 * Does `path` name a real object in the bucket that `kind` + `status` resolve
 * to? Used by the three document save actions (`saveLegislative`,
 * `saveTransparencyDocument`, `saveTransparencyProject`) on every path handed
 * to them by a client.
 *
 * Since security-hardening Plan 3 the upload happens in a *separate* request
 * (POST /api/admin/uploads/document) and the resulting path travels back
 * through the browser before the save action ever sees it, so a save action is
 * handed a string, not a file. The prefix/traversal allow-list those actions
 * apply proves the string is well-formed; it does not prove an object is
 * actually there. This is the cheap other half: it confirms the object exists,
 * and specifically that it exists in the bucket this record's *current* status
 * points at — which also catches an upload that landed in the other bucket of
 * the pair (a stale tab, or a status change between page load and Save).
 *
 * It deliberately stops short of proving the object was created by this
 * request: another record's path in the same bucket still passes. Closing that
 * would need a signed upload receipt, which is disproportionate here — the
 * caller is already an authenticated `manage-transparency` holder.
 */
export async function storedObjectExists(
  kind: MediaKind,
  status: ContentStatus,
  path: string,
): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  const folder = slash === -1 ? "" : path.slice(0, slash);
  const name = path.slice(slash + 1);
  if (name.length === 0) return false;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(bucketForStatus(kind, status))
    .list(folder, { limit: 100, search: name });
  // `search` is a substring match, so the exact-name comparison below is what
  // makes this precise; a Storage error is treated as "no", never as "yes".
  if (error || !data) return false;
  return data.some((entry) => entry.name === name);
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

/**
 * Batch form of `resolveMediaUrl` for a *list* of records that can each be a
 * different status — an admin table showing a published row next to a
 * draft row, say. `resolveMediaUrls` doesn't fit here because it takes one
 * status for its whole batch; this groups rows by published/not instead:
 * published rows resolve with no network call, and every non-published
 * row's path is signed in a single batched `createSignedUrls` call
 * regardless of which specific non-published status it's in — draft,
 * in-review, and archived all read from the same `<kind>-drafts` bucket
 * (see `bucketForStatus`), so one status value stands in for all of them.
 */
export async function resolveMediaUrlsForList(
  kind: MediaKind,
  rows: { path: string | null; status: ContentStatus }[],
): Promise<(string | null)[]> {
  const results: (string | null)[] = rows.map(() => null);
  const toSign = new Map<number, string>();

  rows.forEach((row, i) => {
    if (!row.path) return;
    if (/^https?:\/\//i.test(row.path)) {
      results[i] = row.path;
      return;
    }
    if (row.status === "published") {
      results[i] = mediaUrl(publicBucketFor(kind), row.path);
      return;
    }
    toSign.set(i, row.path);
  });

  if (toSign.size === 0) return results;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(draftBucketFor(kind))
    .createSignedUrls([...toSign.values()], SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.error(`resolveMediaUrlsForList signing failed (${kind}):`, error.message);
    return results;
  }
  const byPath = new Map<string, string>();
  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) byPath.set(entry.path, entry.signedUrl);
  }
  for (const [i, path] of toSign) {
    const url = byPath.get(path);
    if (url) results[i] = url;
  }
  return results;
}
