import type { Metadata } from "next";
import { SettingsPanel } from "@/features/admin";

export const metadata: Metadata = {
  title: "Settings",
};

export default function AdminSettingsPage() {
  return <SettingsPanel />;
}
