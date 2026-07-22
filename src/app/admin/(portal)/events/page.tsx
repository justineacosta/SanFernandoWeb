import { gatedMetadata, requirePermission } from "@/lib/auth";
import { EventsManager } from "@/features/admin";
import { listEvents } from "@/features/admin/queries/events";

export const generateMetadata = gatedMetadata("manage-news", "Event Calendar");

export default async function AdminEventsPage() {
  const user = await requirePermission("manage-news");
  const events = await listEvents();
  return <EventsManager events={events} isSuperAdmin={user.isSuperAdmin} />;
}
