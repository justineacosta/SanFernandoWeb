import {
  CalendarClock,
  CalendarDays,
  FileStack,
  HeartHandshake,
  History,
  Inbox,
  Landmark,
  Megaphone,
  MessagesSquare,
  PanelsTopLeft,
  Scale,
  Settings,
  UserCog,
  Users,
} from "lucide-react";
import type { IconNavItem } from "@/types";

export const ADMIN_NAV_ITEMS: IconNavItem[] = [
  { label: "Applications", href: "/admin/applications", icon: Inbox, permission: "process-applications", group: "requests" },
  { label: "Incident Reports", href: "/admin/complaints", icon: Scale, permission: "handle-complaints", group: "requests" },
  { label: "Appointments", href: "/admin/appointments", icon: CalendarClock, permission: "process-appointments", group: "requests" },
  { label: "Assistance Requests", href: "/admin/assistance", icon: HeartHandshake, permission: "handle-assistance", group: "requests" },
  { label: "Inquiries & Feedback", href: "/admin/inquiries", icon: MessagesSquare, permission: "handle-inquiries", group: "requests" },
  { label: "News & Announcements", href: "/admin/news", icon: Megaphone, permission: "manage-news", group: "content" },
  { label: "Event Calendar", href: "/admin/events", icon: CalendarDays, permission: "manage-news", group: "content" },
  { label: "Transparency", href: "/admin/transparency", icon: FileStack, permission: "manage-transparency", group: "content" },
  { label: "Officials", href: "/admin/officials", icon: Users, permission: "manage-officials", group: "content" },
  { label: "Site Content", href: "/admin/site-content", icon: PanelsTopLeft, permission: "manage-site-content", group: "content" },
  { label: "Users Management", href: "/admin/users", icon: UserCog, superAdminOnly: true, group: "system" },
  { label: "Services Management", href: "/admin/services", icon: Landmark, superAdminOnly: true, group: "system" },
  { label: "Audit Logs", href: "/admin/audit", icon: History, superAdminOnly: true, group: "system" },
  { label: "Settings", href: "/admin/settings", icon: Settings, group: "system" },
];

