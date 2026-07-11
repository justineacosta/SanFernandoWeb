import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { AdminPlaceholder } from "@/features/admin";

export const metadata: Metadata = {
  title: "News & Announcements",
};

export default function AdminNewsPage() {
  return (
    <AdminPlaceholder
      icon={Megaphone}
      title="News & Announcements"
      description="Draft, review, and publish news bulletins, advisories, and announcements."
    />
  );
}
