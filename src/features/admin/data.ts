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
  Users,
} from "lucide-react";
import type {
  AdminTeamMember,
  EventCategory,
  IconNavItem,
  TeamRole,
} from "@/types";

export const ADMIN_NAV_ITEMS: IconNavItem[] = [
  { label: "Applications", href: "/admin/applications", icon: Inbox, permission: "process-applications", group: "requests" },
  { label: "Incident Reports", href: "/admin/complaints", icon: Scale, permission: "handle-complaints", group: "requests" },
  { label: "Appointments", href: "/admin/appointments", icon: CalendarClock, permission: "process-appointments", group: "requests" },
  { label: "Assistance Requests", href: "/admin/assistance", icon: HeartHandshake, permission: "handle-assistance", group: "requests" },
  { label: "Inquiries", href: "/admin/inquiries", icon: MessagesSquare, permission: "handle-inquiries", group: "requests" },
  { label: "News & Announcements", href: "/admin/news", icon: Megaphone, permission: "manage-news", group: "content" },
  { label: "Event Calendar", href: "/admin/events", icon: CalendarDays, permission: "manage-news", group: "content" },
  { label: "Transparency", href: "/admin/transparency", icon: FileStack, permission: "manage-transparency", group: "content" },
  { label: "Officials", href: "/admin/officials", icon: Users, permission: "manage-officials", group: "content" },
  { label: "Site Content", href: "/admin/site-content", icon: PanelsTopLeft, permission: "manage-site-content", group: "content" },
  { label: "Services Management", href: "/admin/services", icon: Landmark, superAdminOnly: true, group: "system" },
  { label: "Audit Logs", href: "/admin/audit", icon: History, superAdminOnly: true, group: "system" },
  { label: "Settings", href: "/admin/settings", icon: Settings, group: "system" },
];

/* ------------------- Section seed data (wraps real public content) ------------------ */

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  "town-hall": "Town Hall",
  "health-drive": "Health Drive",
  festival: "Festival",
  youth: "Youth",
  environment: "Environment",
  community: "Community",
};

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  "super-admin": "Super Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export const ADMIN_TEAM: AdminTeamMember[] = [
  { name: "Maria Santos", role: "super-admin", initials: "MS", isCurrentUser: true },
  { name: "Juan Dela Cruz", role: "editor", initials: "JD" },
  { name: "Ana Reyes", role: "viewer", initials: "AR" },
];

