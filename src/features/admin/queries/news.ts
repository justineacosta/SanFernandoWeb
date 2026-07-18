import "server-only";
import type { AdminNewsArticleRow, ContentStatus, NewsArticleValues, NewsPhoto } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { photoUrl } from "@/lib/storage";
import { formatDate, toManilaDate } from "@/lib/format";

interface Row {
  id: string;
  slug: string;
  title: string;
  category_id: string;
  excerpt: string;
  status: ContentStatus;
  published_at: string | null;
  updated_at: string;
  news_categories: { label: string } | null;
  news_photos: { id: string; src: string; alt: string; sort_order: number }[];
}

/** All news articles for the admin manager grid, most recently updated first. */
export async function listNewsArticles(): Promise<AdminNewsArticleRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("news_articles")
    .select(
      "id, slug, title, category_id, excerpt, status, published_at, updated_at, news_categories(label), news_photos(id, src, alt, sort_order)",
    )
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return (data as unknown as Row[]).map((r) => {
    const cover = [...r.news_photos].sort((a, b) => a.sort_order - b.sort_order)[0] ?? null;
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      category: r.news_categories?.label ?? "—",
      categoryId: r.category_id,
      excerpt: r.excerpt,
      status: r.status,
      coverSrc: cover ? photoUrl(cover.src) : null,
      coverAlt: cover?.alt ?? "",
      photoCount: r.news_photos.length,
      updatedLabel: formatDate(toManilaDate(r.updated_at)),
      publishedLabel: r.published_at ? formatDate(toManilaDate(r.published_at)) : null,
    };
  });
}

/** One article's editable values + status + photos, for the drawer editor. */
export async function getNewsArticleForEdit(
  id: string,
): Promise<{ values: NewsArticleValues; status: ContentStatus; photos: NewsPhoto[] } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("news_articles")
    .select("id, slug, title, category_id, excerpt, body, status, news_photos(id, src, alt, sort_order)")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const photos = ([...(data.news_photos ?? [])] as { id: string; src: string; alt: string; sort_order: number }[])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({ id: p.id, src: photoUrl(p.src), alt: p.alt }));
  return {
    values: {
      title: data.title,
      slug: data.slug,
      categoryId: data.category_id,
      excerpt: data.excerpt,
      body: data.body ?? "",
    },
    status: data.status as ContentStatus,
    photos,
  };
}
