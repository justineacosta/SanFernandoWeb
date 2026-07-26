import "server-only";
import type { Announcement, NewsArticleDetail, NewsArticleListItem } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { photoUrl } from "@/lib/storage";
import { formatDate, toManilaDate } from "@/lib/format";

export const ARCHIVE_BATCH = 6;

function isWithin7Days(publishedAt: string | null): boolean {
  if (!publishedAt) return false;
  const days = (Date.now() - new Date(publishedAt).getTime()) / 86_400_000;
  return days >= 0 && days < 7;
}

interface ArticleRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body?: string;
  published_at: string | null;
  author_name: string | null;
  news_categories: { label: string } | null;
  news_photos: { id: string; src: string; alt: string; sort_order: number }[];
}

function toListItem(row: ArticleRow): NewsArticleListItem {
  const cover = [...row.news_photos].sort((a, b) => a.sort_order - b.sort_order)[0] ?? null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.news_categories?.label ?? "News",
    excerpt: row.excerpt,
    coverSrc: cover ? photoUrl(cover.src) : null,
    coverAlt: cover?.alt ?? "",
    dateLabel: row.published_at ? formatDate(toManilaDate(row.published_at)) : "",
    isNew: isWithin7Days(row.published_at),
    author: row.author_name,
  };
}

export async function listPublishedArticles(
  offset: number,
  limit: number,
): Promise<{ items: NewsArticleListItem[]; total: number }> {
  const admin = createSupabaseAdminClient();
  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 1;

  const { data, count, error } = await admin
    .from("news_articles")
    .select(
      "id, slug, title, excerpt, published_at, author_name, news_categories(label), news_photos(id, src, alt, sort_order)",
      { count: "exact" },
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);

  if (error || !data) return { items: [], total: 0 };
  return {
    items: (data as unknown as ArticleRow[]).map(toListItem),
    total: count ?? 0,
  };
}

export async function getPublishedArticleBySlug(slug: string): Promise<NewsArticleDetail | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("news_articles")
    .select(
      "id, slug, title, excerpt, body, published_at, author_name, news_categories(label), news_photos(id, src, alt, sort_order)",
    )
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as unknown as ArticleRow;
  const photos = [...row.news_photos]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({ id: p.id, src: photoUrl(p.src), alt: p.alt }));
  return { ...toListItem(row), body: row.body ?? "", photos };
}

export async function listPublishedAnnouncements(limit = 3): Promise<Announcement[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("announcements")
    .select("title, date, excerpt, image_src, image_alt, urgent, published_at")
    .eq("status", "published")
    .order("date", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map((r) => ({
    title: r.title,
    date: r.date,
    excerpt: r.excerpt,
    image: r.image_src ? photoUrl(r.image_src) : undefined,
    imageAlt: r.image_alt ?? "",
    urgent: r.urgent,
    isNew: isWithin7Days(r.published_at),
  }));
}
