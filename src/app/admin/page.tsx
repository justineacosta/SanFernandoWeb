import type { Metadata } from "next";
import { ContentHub } from "@/features/admin";

export const metadata: Metadata = {
  title: "Content Hub",
};

export default function AdminDashboardPage() {
  return <ContentHub />;
}
