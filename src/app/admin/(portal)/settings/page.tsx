import type { Metadata } from "next";
import { requireSessionUser } from "@/lib/auth";
import { listArchivedTeamUsers, listTeamUsers } from "@/features/admin/queries/users";
import { SettingsPanel } from "@/features/admin";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function AdminSettingsPage() {
  const currentUser = await requireSessionUser();
  // Both reads are SuperAdmin-only; a staff member gets empty lists and the
  // TeamManager is not rendered for them at all.
  const [team, archived] = currentUser.isSuperAdmin
    ? await Promise.all([listTeamUsers(), listArchivedTeamUsers()])
    : [[], []];
  return <SettingsPanel team={team} archived={archived} currentUser={currentUser} />;
}
