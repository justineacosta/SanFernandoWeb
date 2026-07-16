import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth";
import { listServiceCatalog } from "@/features/admin/queries/services";
import { ServicesManager } from "@/features/admin/components/services-manager";

export const metadata: Metadata = {
  title: "Services Management",
};

export default async function AdminServicesPage() {
  await requireSuperAdmin();
  const services = await listServiceCatalog();
  return <ServicesManager services={services} />;
}
