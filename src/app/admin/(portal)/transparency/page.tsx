import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { TransparencyManager, TransparencyCategoriesPanel } from "@/features/admin";
import {
  listAdminLegislative,
  listAdminTransparencyDocuments,
  listAdminTransparencyProjects,
} from "@/features/admin/queries/transparency";
import { listTransparencyCategories } from "@/features/admin/queries/transparency-categories";

export const metadata: Metadata = { title: "Transparency" };

export default async function AdminTransparencyPage() {
  const user = await requirePermission("manage-transparency");
  const [documents, files, projects, categories] = await Promise.all([
    listAdminLegislative(),
    listAdminTransparencyDocuments(),
    listAdminTransparencyProjects(),
    listTransparencyCategories(),
  ]);
  return (
    <>
      <TransparencyManager
        legislative={documents}
        documents={files}
        projects={projects}
        categories={categories}
        isSuperAdmin={user.isSuperAdmin}
      />
      {user.isSuperAdmin ? (
        <div className="mt-8">
          <TransparencyCategoriesPanel categories={categories} />
        </div>
      ) : null}
    </>
  );
}
