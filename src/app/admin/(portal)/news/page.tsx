import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { NewsManager, NewsCategoriesPanel } from "@/features/admin";
import { listNewsArticles } from "@/features/admin/queries/news";
import { listAnnouncements } from "@/features/admin/queries/announcements";
import { listNewsCategories } from "@/features/admin/queries/news-categories";

export const metadata: Metadata = { title: "News & Announcements" };

export default async function AdminNewsPage() {
  const user = await requirePermission("manage-news");
  const [articles, announcements, categories] = await Promise.all([
    listNewsArticles(),
    listAnnouncements(),
    listNewsCategories(),
  ]);
  return (
    <>
      <NewsManager articles={articles} announcements={announcements} categories={categories} />
      {user.isSuperAdmin ? (
        <div className="mt-8">
          <NewsCategoriesPanel categories={categories} />
        </div>
      ) : null}
    </>
  );
}
