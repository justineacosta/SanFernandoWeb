"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AuditActionType, ContentStatus, GalleryPhoto, NewsArticleValues, SessionUser } from "@/types";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { guardDelete, statusPatch } from "@/lib/archive";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  bucketForStatus,
  draftBucketFor,
  extForType,
  newsPhotoPath,
  sniffMimeType,
} from "@/lib/storage";
import { cleanupPromotedMedia, demoteMedia, promoteMedia, resolveMediaUrls } from "@/lib/media-lifecycle";
import { getNewsArticleForEdit } from "@/features/admin/queries/news";

export interface ActionResult {
  error: string | null;
}
export interface SaveResult {
  error: string | null;
  id: string | null;
  /**
   * The article's photos after the save, so a drawer that stays open (the
   * create case) can swap its pending previews for the stored ones instead of
   * showing both. Null when the save wrote no photos.
   */
  photos?: GalleryPhoto[] | null;
}

const schema = z.object({
  title: z.string().trim().min(3, "Enter a title."),
  slug: z.string().trim().min(1, "Enter a slug."),
  categoryId: z.string().trim().min(1, "Pick a category."),
  excerpt: z.string().trim().min(1, "Enter an excerpt."),
  body: z.string(),
});

function slugify(title: string): string {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function revalidate() {
  revalidatePath("/admin/news");
  revalidatePath("/announcements");
  revalidatePath("/news");
  revalidatePath("/announcements/[slug]", "page");
  revalidatePath("/");
}

type SlugResult = { slug: string; error: null } | { slug: null; error: string };

/** Ensure a slug is unique, suffixing -2, -3… (ignoring the row being edited). */
async function uniqueSlug(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  base: string,
  ignoreId: string | null,
): Promise<SlugResult> {
  const { data, error } = await admin.from("news_articles").select("id, slug");
  if (error) return { slug: null, error: "Could not save the article. Try again." };
  const taken = new Set((data ?? []).filter((r) => r.id !== ignoreId).map((r) => r.slug));
  if (!taken.has(base)) return { slug: base, error: null };
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return { slug: candidate, error: null };
  }
}

/**
 * Client-callable counterpart to `getNewsArticleForEdit` (which is `server-only`
 * and so cannot be imported into the "use client" manager). The manager fetches
 * full editable detail — including `body` and the photo list, neither of which
 * travels in the list rows — only when a drawer is opened for editing.
 */
export async function getNewsArticleForEditAction(
  id: string,
): Promise<{ values: NewsArticleValues; status: ContentStatus; photos: GalleryPhoto[] } | null> {
  if (!(await checkPermission("manage-news"))) return null;
  return getNewsArticleForEdit(id);
}

const MAX_PHOTOS = 3;

/**
 * Write the photos chosen in this drawer session against an article that now
 * exists. Called only after the row write has succeeded, because
 * `newsPhotoPath` keys the object path by article id.
 *
 * All-or-nothing for the batch: a failure part-way deletes every object and row
 * this call created and leaves the article's existing photos untouched, so the
 * pending list the user is still looking at stays an accurate description of
 * what is missing. Photos that were already stored are never in scope.
 */
async function attachPendingPhotos(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  articleId: string,
  status: ContentStatus,
  files: File[],
  alts: string[],
): Promise<{ error: string | null }> {
  if (files.length === 0) return { error: null };

  const bucket = bucketForStatus("news", status);

  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      return { error: "Photos must be JPG, PNG, or WebP." };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { error: "Each photo must be 2 MB or smaller." };
    }
  }

  const { data: existing, error: readErr } = await admin
    .from("news_photos")
    .select("id, sort_order")
    .eq("article_id", articleId);
  if (readErr) return { error: "Could not attach the photos." };
  if ((existing ?? []).length + files.length > MAX_PHOTOS) {
    return { error: `A post can have at most ${MAX_PHOTOS} photos.` };
  }

  const paths: string[] = [];
  const rowIds: string[] = [];

  async function rollback(message: string): Promise<{ error: string }> {
    if (rowIds.length > 0) {
      await admin.from("news_photos").delete().in("id", rowIds);
    }
    if (paths.length > 0) {
      const { error } = await admin.storage.from(bucket).remove(paths);
      if (error) {
        console.error(`Orphaned storage objects (photo rollback failed): ${paths.join(", ")}`);
      }
    }
    return { error: message };
  }

  let sortOrder = (existing ?? []).reduce(
    (max, p) => Math.max(max, p.sort_order as number),
    -1,
  );
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = newsPhotoPath(articleId, extForType(file.type));
    const buffer = Buffer.from(await file.arrayBuffer());
    // rollback(), not a bare return: earlier photos in this loop are already
    // uploaded and rowed, and this function's invariant is all-or-nothing.
    // The string matches the declared-type rejection at line 111.
    if (sniffMimeType(buffer) !== file.type) {
      return rollback("Photos must be JPG, PNG, or WebP.");
    }
    const { error: upErr } = await admin.storage
      .from(bucket)
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (upErr) return rollback("Could not upload the photos. Try again.");
    paths.push(path);

    sortOrder += 1;
    const { data: row, error: insErr } = await admin
      .from("news_photos")
      .insert({ article_id: articleId, src: path, alt: alts[i] ?? "", sort_order: sortOrder })
      .select("id")
      .single();
    if (insErr || !row) return rollback("Could not attach the photos. Try again.");
    rowIds.push(row.id as string);
  }

  return { error: null };
}

/** The article's stored photos, in display order. */
async function listPhotos(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  articleId: string,
  status: ContentStatus,
): Promise<GalleryPhoto[]> {
  const { data } = await admin
    .from("news_photos")
    .select("id, src, alt")
    .eq("article_id", articleId)
    .order("sort_order", { ascending: true });
  const rows = (data ?? []) as { id: string; src: string; alt: string }[];
  const urlByPath = await resolveMediaUrls("news", status, rows.map((p) => p.src));
  return rows.map((p) => ({
    id: p.id,
    src: urlByPath.get(p.src) ?? p.src,
    alt: p.alt,
  }));
}

export async function saveNewsArticle(
  id: string | null,
  values: NewsArticleValues,
  photoForm: FormData,
): Promise<SaveResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND, id: null };
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid values.", id: null };

  const admin = createSupabaseAdminClient();

  // Photos chosen in this drawer session. They are written only after the
  // article row exists, so unlike the single-image saves there is nothing to
  // compensate for here: an upload never runs ahead of its row.
  const files = photoForm.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  const alts = photoForm.getAll("photoAlts").map((a) => (typeof a === "string" ? a : ""));

  /** The row saved; only the photos did not. Say so, and keep the id. */
  function savedWithoutPhotos(articleId: string, reason: string): SaveResult {
    return { error: `Saved, but the photos were not attached. ${reason}`, id: articleId };
  }

  // category must exist — never trust categoryId from the client.
  const { data: cat, error: catErr } = await admin
    .from("news_categories")
    .select("id")
    .eq("id", parsed.data.categoryId)
    .maybeSingle();
  if (catErr) return { error: "Could not save the article. Try again.", id: null };
  if (!cat) return { error: "Pick a valid category.", id: null };

  if (id) {
    // Editing: lock the slug once published.
    const { data: existing, error: readErr } = await admin
      .from("news_articles")
      .select("status, slug")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return { error: "Could not save the article.", id: null };
    if (!existing) return { error: "Article not found.", id: null };

    const wasPublished = existing.status === "published";
    let slug = existing.slug;
    if (!wasPublished) {
      const slugResult = await uniqueSlug(admin, slugify(parsed.data.slug) || slugify(parsed.data.title), id);
      if (slugResult.error) return { error: slugResult.error, id: null };
      slug = slugResult.slug;
    }

    let query = admin
      .from("news_articles")
      .update({
        title: parsed.data.title,
        slug,
        category_id: parsed.data.categoryId,
        excerpt: parsed.data.excerpt,
        body: parsed.data.body,
      })
      .eq("id", id);
    // The slug above was computed against the status just read. If that read
    // saw a non-published status, re-assert it in the WHERE: should the
    // article get published concurrently, this update must not silently
    // apply a slug computed against the now-stale status.
    if (!wasPublished) {
      query = query.in("status", ["draft", "in-review", "archived"]);
    }
    const { data: updated, error } = await query.select("id").maybeSingle();
    if (error) return { error: "Could not save the article.", id: null };
    if (!updated) {
      return {
        error: wasPublished
          ? "Article not found."
          : "This article was published while you were editing. Reopen it and try again.",
        id: null,
      };
    }
    await recordActivity(actor, {
      type: "update",
      action: "updated news article",
      entityType: "news article",
      entityId: id,
      entityLabel: parsed.data.title,
    });
    const attached = await attachPendingPhotos(admin, id, existing.status as ContentStatus, files, alts);
    revalidate();
    if (attached.error) return savedWithoutPhotos(id, attached.error);
    return {
      error: null,
      id,
      photos: files.length > 0 ? await listPhotos(admin, id, existing.status as ContentStatus) : null,
    };
  }

  const slugResult = await uniqueSlug(admin, slugify(parsed.data.slug) || slugify(parsed.data.title), null);
  if (slugResult.error) return { error: slugResult.error, id: null };
  const slug = slugResult.slug;
  const { data: inserted, error } = await admin
    .from("news_articles")
    .insert({
      title: parsed.data.title,
      slug,
      category_id: parsed.data.categoryId,
      excerpt: parsed.data.excerpt,
      body: parsed.data.body,
      author_id: actor.id,
      author_name: actor.fullName,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !inserted) return { error: "Could not create the article.", id: null };
  await recordActivity(actor, {
    type: "create",
    action: "created news article",
    entityType: "news article",
    entityId: inserted.id,
    entityLabel: parsed.data.title,
  });
  const attached = await attachPendingPhotos(admin, inserted.id, "draft", files, alts);
  revalidate();
  if (attached.error) return savedWithoutPhotos(inserted.id, attached.error);
  return {
    error: null,
    id: inserted.id,
    photos: files.length > 0 ? await listPhotos(admin, inserted.id, "draft") : null,
  };
}

/**
 * Apply a status transition. The `from` set is enforced inside the UPDATE's
 * WHERE (not a read-then-write) so a concurrent transition can't race past
 * this check. `actor` is resolved by the caller so that every exported
 * action's own first statement is the `checkPermission` gate.
 */
async function applyTransition(
  actor: SessionUser,
  id: string,
  from: string[],
  patch: Record<string, unknown>,
  type: AuditActionType,
  verb: string,
): Promise<ActionResult> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("news_articles")
    .update(patch)
    .eq("id", id)
    .in("status", from)
    .select("id, title")
    .maybeSingle();
  if (error) return { error: "Could not update the article." };
  if (!data) return { error: "This article is no longer in a state that allows that action." };
  await recordActivity(actor, { type, action: verb, entityType: "news article", entityId: id, entityLabel: data.title });
  revalidate();
  return { error: null };
}

export async function submitNewsForReview(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  return applyTransition(actor, id, ["draft"], { status: "in-review" }, "update", "submitted news article for review");
}

export async function returnNewsToDraft(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  return applyTransition(actor, id, ["in-review"], { status: "draft" }, "save_draft", "returned news article to draft");
}

export async function archiveNewsArticle(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  const admin = createSupabaseAdminClient();
  const patch = statusPatch(actor, "archived");

  let result: { id: string; title: string } | null = null;
  let wasPublished = false;
  {
    const { data, error } = await admin
      .from("news_articles")
      .update(patch)
      .eq("id", id)
      .eq("status", "published")
      .select("id, title")
      .maybeSingle();
    if (error) return { error: "Could not update the article." };
    if (data) {
      result = data;
      wasPublished = true;
    }
  }
  if (!result) {
    const { data, error } = await admin
      .from("news_articles")
      .update(patch)
      .eq("id", id)
      .in("status", ["draft", "in-review"])
      .select("id, title")
      .maybeSingle();
    if (error) return { error: "Could not update the article." };
    result = data;
  }
  if (!result) return { error: "This article is no longer in a state that allows that action." };

  if (wasPublished) {
    const { data: photos, error: photosErr } = await admin
      .from("news_photos")
      .select("src")
      .eq("article_id", id);
    if (photosErr) {
      console.error(`Could not read photos to demote for archived article ${id}: ${photosErr.message}`);
    }
    const paths = (photos ?? []).map((p) => p.src as string);
    if (paths.length > 0) {
      await demoteMedia("news", paths, "news article archived");
    }
  }

  await recordActivity(actor, {
    type: "archive",
    action: "archived news article",
    entityType: "news article",
    entityId: id,
    entityLabel: result.title,
  });
  revalidate();
  return { error: null };
}

/** Bring an archived article back as a draft — not straight back onto the news feed. */
export async function restoreNewsArticle(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  return applyTransition(
    actor,
    id,
    ["archived"],
    statusPatch(actor, "draft"),
    "restore",
    "restored news article",
  );
}

/**
 * Hard delete — SuperAdmin only, and only from `archived` (umbrella §3.2).
 *
 * Deleting the article cascades away its `news_photos` ROWS, but Postgres knows
 * nothing about Storage: the objects have to be collected while the rows still
 * exist or they are orphaned forever. This is the work that kept the action out
 * of sub-project 6.
 */
export async function deleteNewsArticle(id: string): Promise<ActionResult> {
  const guard = await guardDelete<{ title: string; slug: string }>(
    "news_articles",
    id,
    "title, slug",
  );
  if (!guard.ok) return { error: guard.error };
  const { actor, row: existing } = guard;

  const admin = createSupabaseAdminClient();
  const { data: photos } = await admin.from("news_photos").select("src").eq("article_id", id);
  const paths = (photos ?? [])
    .map((photo) => photo.src as string)
    .filter((src) => !/^https?:\/\//i.test(src));

  const { error } = await admin.from("news_articles").delete().eq("id", id);
  if (error) return { error: "Could not delete the article." };

  if (paths.length > 0) {
    const { error: removeErr } = await admin.storage.from(draftBucketFor("news")).remove(paths);
    if (removeErr) {
      // A failed cleanup must not fail the delete the user just made, but the
      // orphans it leaves are invisible otherwise — log the paths for a human.
      console.error(`Orphaned storage objects (news photo cleanup failed): ${paths.join(", ")}`);
    }
  }
  await recordActivity(actor, {
    type: "delete",
    action: "deleted news article",
    entityType: "news article",
    entityId: id,
    entityLabel: existing.title,
  });
  revalidate();
  return { error: null };
}

/** Publish; set published_at only on first publish so re-publishing an archived article doesn't bump it. */
export async function publishNewsArticle(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  const admin = createSupabaseAdminClient();
  const { data: row, error: readErr } = await admin
    .from("news_articles")
    .select("published_at, title, excerpt, status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { error: "Could not publish the article." };
  if (!row) return { error: "Article not found." };
  if (!row.excerpt?.trim()) return { error: "Add an excerpt before publishing." };

  const alreadyPublished = row.status === "published";
  let photoPaths: string[] = [];
  if (!alreadyPublished) {
    const { data: photos } = await admin.from("news_photos").select("src").eq("article_id", id);
    photoPaths = (photos ?? []).map((p) => p.src as string);
    if (photoPaths.length > 0) {
      const promoted = await promoteMedia("news", photoPaths);
      if (promoted.error) return { error: "Could not publish the article's photos. Try again." };
    }
  }

  const patch = statusPatch(actor, "published");
  if (!row.published_at) patch.published_at = new Date().toISOString();
  const { data, error } = await admin
    .from("news_articles")
    .update(patch)
    .eq("id", id)
    .in("status", ["draft", "in-review", "archived"])
    .select("id")
    .maybeSingle();
  if (error) return { error: "Could not publish the article." };
  if (!data) return { error: "This article is already published." };

  if (!alreadyPublished && photoPaths.length > 0) {
    await cleanupPromotedMedia("news", photoPaths, "news article published");
  }

  await recordActivity(actor, {
    type: "publish",
    action: "published news article",
    entityType: "news article",
    entityId: id,
    entityLabel: row.title,
  });
  revalidate();
  return { error: null };
}
