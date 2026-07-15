import type { Metadata } from "next";
import { NewsManager } from "@/features/admin";

export const metadata: Metadata = {
  title: "News & Announcements",
};

export default function AdminNewsPage() {
  return <NewsManager />;
}
