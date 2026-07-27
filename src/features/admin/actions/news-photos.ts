"use server";

import { revalidatePath } from "next/cache";
import type { ContentStatus } from "@/types";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bucketForStatus } from "@/lib/storage";

export interface ActionResult {
  error: string | null;
}

function revalidate() {
  revalidatePath("/admin/news");
  revalidatePath("/announcements");
  revalidatePath("/news");
}

/*
 * Uploading lives in saveNewsArticle, not here.
 *
 * The uploader used to call an `uploadNewsPhotos` action on file-select, which
 * meant a photo could only be attached to an article that already existed —
 * hence the old "save this post as a draft first" message. Sub-project 7 moved
 * the write into the article's own save so a new post and its photos commit
 * together. The actions left in this file all act on rows that already exist.
 */

export async function reorderNewsPhotos(
  articleId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  const admin = createSupabaseAdminClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin
      .from("news_photos")
      .update({ sort_order: i })
      .eq("id", orderedIds[i])
      .eq("article_id", articleId);
    if (error) return { error: "Could not reorder photos." };
  }
  await recordActivity(actor, {
    type: "reorder",
    action: "reordered news photos",
    entityType: "news article",
    entityId: articleId,
  });
  revalidate();
  return { error: null };
}

export async function updateNewsPhotoAlt(photoId: string, alt: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  const admin = createSupabaseAdminClient();
  const { data: photo, error: readErr } = await admin
    .from("news_photos")
    .select("id, article_id")
    .eq("id", photoId)
    .maybeSingle();
  if (readErr) return { error: "Could not update the photo description." };
  if (!photo) return { error: "Could not update the photo description." };
  const { error } = await admin.from("news_photos").update({ alt }).eq("id", photoId);
  if (error) return { error: "Could not update the photo description." };
  await recordActivity(actor, {
    type: "update",
    action: "updated news photo description",
    entityType: "news article",
    entityId: photo.article_id,
  });
  revalidate();
  return { error: null };
}

export async function removeNewsPhoto(photoId: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  const admin = createSupabaseAdminClient();
  const { data: photo, error: readErr } = await admin
    .from("news_photos")
    .select("id, src, article_id, news_articles!inner(status)")
    .eq("id", photoId)
    .maybeSingle();
  if (readErr) return { error: "Could not remove the photo." };
  if (!photo) return { error: null }; // already gone

  const { error } = await admin.from("news_photos").delete().eq("id", photoId);
  if (error) return { error: "Could not remove the photo." };

  // Only once the row is gone: an object deleted ahead of a failed row delete
  // would leave a live photo row pointing at nothing. Only delete an object we
  // own (uploaded path), never a seed URL.
  if (!/^https?:\/\//i.test(photo.src)) {
    const articleStatus = (photo.news_articles as unknown as { status: ContentStatus }).status;
    const { error: removeErr } = await admin.storage
      .from(bucketForStatus("news", articleStatus))
      .remove([photo.src]);
    if (removeErr) {
      console.error(`Orphaned storage object (news photo cleanup failed): ${photo.src}`);
    }
  }
  await recordActivity(actor, {
    type: "file_delete",
    action: "removed news photo",
    entityType: "news article",
    entityId: photo.article_id,
  });
  revalidate();
  return { error: null };
}
