import { gatedMetadata, requirePermission } from "@/lib/auth";
import { OfficialsManager } from "@/features/admin";
import { listAdminOfficials } from "@/features/admin/queries/officials";

export const generateMetadata = gatedMetadata("manage-officials", "Officials");

export default async function AdminOfficialsPage() {
  const user = await requirePermission("manage-officials");
  const officials = await listAdminOfficials();
  return <OfficialsManager officials={officials} isSuperAdmin={user.isSuperAdmin} />;
}
