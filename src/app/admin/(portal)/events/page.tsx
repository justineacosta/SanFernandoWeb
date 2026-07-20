import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { EventsManager } from "@/features/admin";
import { listEvents } from "@/features/admin/queries/events";

export const metadata: Metadata = {
  title: "Event Calendar",
};

export default async function AdminEventsPage() {
  await requirePermission("manage-news");
  const events = await listEvents();
  return <EventsManager events={events} />;
}
