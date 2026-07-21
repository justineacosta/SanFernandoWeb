import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { OfficialsManager } from "@/features/admin";
import { listAdminOfficials } from "@/features/admin/queries/officials";

export const metadata: Metadata = { title: "Officials" };

export default async function AdminOfficialsPage() {
  await requirePermission("manage-officials");
  const officials = await listAdminOfficials();
  return <OfficialsManager officials={officials} />;
}
