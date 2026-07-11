import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { AdminPlaceholder } from "@/features/admin";

export const metadata: Metadata = {
  title: "Event Calendar",
};

export default function AdminEventsPage() {
  return (
    <AdminPlaceholder
      icon={CalendarDays}
      title="Event Calendar"
      description="Schedule and manage community events shown on the public portal."
    />
  );
}
