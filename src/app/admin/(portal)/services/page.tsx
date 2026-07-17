import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth";
import { listServiceCatalog } from "@/features/admin/queries/services";
import { listAssistanceCategories } from "@/features/admin/queries/assistance";
import { ServicesManager } from "@/features/admin/components/services-manager";
import { AssistanceCategoriesPanel } from "@/features/admin/components/assistance-categories-panel";

export const metadata: Metadata = {
  title: "Services Management",
};

export default async function AdminServicesPage() {
  await requireSuperAdmin();
  const [services, categories] = await Promise.all([
    listServiceCatalog(),
    listAssistanceCategories(),
  ]);
  return (
    <>
      <ServicesManager services={services} />
      <div className="mt-8">
        <AssistanceCategoriesPanel categories={categories} />
      </div>
    </>
  );
}
