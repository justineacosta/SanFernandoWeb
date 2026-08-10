import {
  Accessibility,
  Bell,
  Briefcase,
  CalendarDays,
  Droplets,
  FileBadge,
  FileCheck,
  FileEdit,
  FileText,
  Gavel,
  GraduationCap,
  HandHeart,
  Heart,
  HeartHandshake,
  Home,
  IdCard,
  Landmark,
  LayoutGrid,
  Leaf,
  Map,
  MessageSquare,
  Receipt,
  Recycle,
  ScrollText,
  ShieldCheck,
  Stamp,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps stored icon-name strings to Lucide components. The DB (and any future
 * API) stores names, never components — resolve them here on the frontend.
 * Extend this map (and ICON_OPTIONS below) as new services introduce new icons.
 */
const ICONS: Record<string, LucideIcon> = {
  "file-text": FileText,
  "shield-check": ShieldCheck,
  store: Store,
  "heart-handshake": HeartHandshake,
  gavel: Gavel,
  "id-card": IdCard,
  "scroll-text": ScrollText,
  stamp: Stamp,
  landmark: Landmark,
  home: Home,
  users: Users,
  briefcase: Briefcase,
  receipt: Receipt,
  "file-check": FileCheck,
  "graduation-cap": GraduationCap,
  "hand-heart": HandHeart,
  // Added by sub-project 9 for the Home/About blocks. They share this map so
  // resolveIcon stays the single resolution point; the pickers differ below.
  bell: Bell,
  "calendar-days": CalendarDays,
  "file-badge": FileBadge,
  "file-edit": FileEdit,
  heart: Heart,
  "layout-grid": LayoutGrid,
  map: Map,
  "message-square": MessageSquare,
  accessibility: Accessibility,
  droplets: Droplets,
  leaf: Leaf,
  recycle: Recycle,
};

/** Resolve an icon name to a component, falling back to a neutral document icon. */
export function resolveIcon(name: string): LucideIcon {
  return ICONS[name] ?? FileText;
}

/** Options for the admin service icon picker (value = stored icon_name). */
export const ICON_OPTIONS: { value: string; label: string }[] = [
  { value: "file-text", label: "Document" },
  { value: "shield-check", label: "Clearance / Shield" },
  { value: "store", label: "Business / Store" },
  { value: "heart-handshake", label: "Assistance / Handshake" },
  { value: "gavel", label: "Legal / Gavel" },
  { value: "id-card", label: "ID Card" },
  { value: "scroll-text", label: "Certificate / Scroll" },
  { value: "stamp", label: "Permit / Stamp" },
  { value: "landmark", label: "Government / Landmark" },
  { value: "home", label: "Residency / Home" },
  { value: "users", label: "Community / Users" },
  { value: "briefcase", label: "Employment / Briefcase" },
  { value: "receipt", label: "Payment / Receipt" },
  { value: "file-check", label: "Approval / File Check" },
  { value: "graduation-cap", label: "Scholarship / Graduation" },
  { value: "hand-heart", label: "Welfare / Hand Heart" },
  { value: "calendar-days", label: "Appointment / Calendar" },
];

/**
 * Options for the Home/About content pickers (sub-project 9). A separate list
 * rather than an extension of ICON_OPTIONS: the labels above are
 * service-flavoured ("Residency / Home", "Permit / Stamp") and read as nonsense
 * against a core value or a population figure. Both lists resolve through the
 * same ICONS map, so nothing can drift out of sync.
 */
export const SITE_ICON_OPTIONS: { value: string; label: string }[] = [
  { value: "users", label: "People" },
  { value: "home", label: "Households / Home" },
  { value: "map", label: "Land / Map" },
  { value: "layout-grid", label: "Sitios / Grid" },
  { value: "heart", label: "Heart" },
  { value: "hand-heart", label: "Volunteering" },
  { value: "heart-handshake", label: "Service / Handshake" },
  { value: "message-square", label: "Feedback / Message" },
  { value: "bell", label: "Updates / Bell" },
  { value: "shield-check", label: "Integrity / Shield" },
  { value: "accessibility", label: "Accountability" },
  { value: "leaf", label: "Environment / Leaf" },
  { value: "recycle", label: "Recycling" },
  { value: "droplets", label: "Water / Flooding" },
  { value: "calendar-days", label: "Appointments / Calendar" },
  { value: "file-text", label: "Document" },
  { value: "file-badge", label: "Certificate" },
  { value: "file-edit", label: "Complaint / Form" },
  { value: "file-check", label: "Approval" },
  { value: "store", label: "Business / Store" },
  { value: "landmark", label: "Government / Landmark" },
  { value: "graduation-cap", label: "Education" },
];
