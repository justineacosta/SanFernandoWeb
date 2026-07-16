import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { ApplicationsManager } from "@/features/admin";
import { listApplications, listApplicationServices } from "@/features/admin/queries/applications";

export const metadata: Metadata = {
  title: "Applications",
};

export default async function AdminApplicationsPage() {
  await requirePermission("process-applications");
  const [applications, services] = await Promise.all([
    listApplications(),
    listApplicationServices(),
  ]);
  return <ApplicationsManager applications={applications} services={services} />;
}
