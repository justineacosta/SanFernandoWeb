import { gatedMetadata, requireSuperAdmin } from "@/lib/auth";
import { listArchivedTeamUsers, listTeamUsers } from "@/features/admin/queries/users";
import { TeamManager } from "@/features/admin";

// Gated like every other SuperAdmin route: a staff user who reaches this URL
// gets the 404 body, and the title must not print the module's name over it
// (same rule as adminPageTitle). A static `metadata` would leak it.
export const generateMetadata = gatedMetadata("superadmin", "Users Management");

export default async function AdminUsersPage() {
  // Both reads are SuperAdmin-only, and so is this whole module — the gate is
  // the page's own check, not the shape of the data it fetches.
  const currentUser = await requireSuperAdmin();
  const [team, archived] = await Promise.all([listTeamUsers(), listArchivedTeamUsers()]);
  return <TeamManager team={team} archived={archived} currentUser={currentUser} />;
}
