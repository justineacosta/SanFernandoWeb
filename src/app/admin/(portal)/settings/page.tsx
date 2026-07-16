import type { Metadata } from "next";
import { requireSessionUser } from "@/lib/auth";
import { listTeamUsers } from "@/features/admin/queries/users";
import { SettingsPanel } from "@/features/admin";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function AdminSettingsPage() {
  const currentUser = await requireSessionUser();
  const team = currentUser.isSuperAdmin ? await listTeamUsers() : [];
  return <SettingsPanel team={team} currentUser={currentUser} />;
}
