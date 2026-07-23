import { gatedMetadata, requirePermission } from "@/lib/auth";
import { NewsManager, NewsCategoriesPanel } from "@/features/admin";
import { listNewsArticles } from "@/features/admin/queries/news";
import { listAnnouncements } from "@/features/admin/queries/announcements";
import { listNewsCategories } from "@/features/admin/queries/news-categories";

export const generateMetadata = gatedMetadata("manage-news", "News & Announcements");

export default async function AdminNewsPage() {
  const user = await requirePermission("manage-news");
  const [articles, announcements, categories] = await Promise.all([
    listNewsArticles(),
    listAnnouncements(),
    listNewsCategories(),
  ]);
  return (
    <>
      <NewsManager
        articles={articles}
        announcements={announcements}
        categories={categories}
        isSuperAdmin={user.isSuperAdmin}
      />
      {user.isSuperAdmin ? (
        <div className="mt-8">
          <NewsCategoriesPanel categories={categories} />
        </div>
      ) : null}
    </>
  );
}
