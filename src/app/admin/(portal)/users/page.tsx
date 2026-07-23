import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth";
import { listArchivedTeamUsers, listTeamUsers } from "@/features/admin/queries/users";
import { TeamManager } from "@/features/admin";

export const metadata: Metadata = {
  title: "Users Management",
};

export default async function AdminUsersPage() {
  // Both reads are SuperAdmin-only, and so is this whole module — the gate is
  // the page's own check, not the shape of the data it fetches.
  const currentUser = await requireSuperAdmin();
  const [team, archived] = await Promise.all([listTeamUsers(), listArchivedTeamUsers()]);
  return <TeamManager team={team} archived={archived} currentUser={currentUser} />;
}
