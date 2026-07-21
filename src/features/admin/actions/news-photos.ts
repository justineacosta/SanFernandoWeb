"use server";

import { revalidatePath } from "next/cache";
import type { GalleryPhoto } from "@/types";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PUBLIC_MEDIA_BUCKET,
  extForType,
  newsPhotoPath,
  photoUrl,
} from "@/lib/storage";

export interface ActionResult {
  error: string | null;
}

const MAX_PHOTOS = 3;

function revalidate() {
  revalidatePath("/admin/news");
  revalidatePath("/announcements");
}

async function currentPhotos(admin: ReturnType<typeof createSupabaseAdminClient>, articleId: string) {
  const { data } = await admin
    .from("news_photos")
    .select("id, src, alt, sort_order")
    .eq("article_id", articleId)
    .order("sort_order", { ascending: true });
  return data ?? [];
}

export async function uploadNewsPhotos(
  articleId: string,
  formData: FormData,
): Promise<{ error: string | null; photos: GalleryPhoto[] }> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND, photos: [] };
  const admin = createSupabaseAdminClient();

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Choose at least one photo.", photos: [] };

  const existing = await currentPhotos(admin, articleId);
  if (existing.length + files.length > MAX_PHOTOS) {
    return { error: `A post can have at most ${MAX_PHOTOS} photos.`, photos: [] };
  }
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      return { error: "Photos must be JPG, PNG, or WebP.", photos: [] };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { error: "Each photo must be 2 MB or smaller.", photos: [] };
    }
  }

  let sortOrder = existing.reduce((max, p) => Math.max(max, p.sort_order), -1);
  for (const file of files) {
    const path = newsPhotoPath(articleId, extForType(file.type));
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from(PUBLIC_MEDIA_BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (upErr) return { error: "Upload failed. Try again.", photos: [] };
    sortOrder += 1;
    const { error: insErr } = await admin
      .from("news_photos")
      .insert({ article_id: articleId, src: path, alt: "", sort_order: sortOrder });
    if (insErr) return { error: "Upload failed. Try again.", photos: [] };
  }

  await recordActivity(actor, "uploaded news photos", "news article", articleId);
  revalidate();
  const refreshed = await currentPhotos(admin, articleId);
  return { error: null, photos: refreshed.map((p) => ({ id: p.id, src: photoUrl(p.src), alt: p.alt })) };
}

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
  await recordActivity(actor, "reordered news photos", "news article", articleId);
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
  await recordActivity(actor, "updated news photo description", "news article", photo.article_id);
  revalidate();
  return { error: null };
}

export async function removeNewsPhoto(photoId: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  const admin = createSupabaseAdminClient();
  const { data: photo, error: readErr } = await admin
    .from("news_photos")
    .select("id, src, article_id")
    .eq("id", photoId)
    .maybeSingle();
  if (readErr) return { error: "Could not remove the photo." };
  if (!photo) return { error: null }; // already gone
  // Only delete an object we own (uploaded path), never a seed URL.
  if (!/^https?:\/\//i.test(photo.src)) {
    await admin.storage.from(PUBLIC_MEDIA_BUCKET).remove([photo.src]);
  }
  const { error } = await admin.from("news_photos").delete().eq("id", photoId);
  if (error) return { error: "Could not remove the photo." };
  await recordActivity(actor, "removed news photo", "news article", photo.article_id);
  revalidate();
  return { error: null };
}
