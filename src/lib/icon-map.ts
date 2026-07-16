import {
  Briefcase,
  FileCheck,
  FileText,
  Gavel,
  GraduationCap,
  HandHeart,
  HeartHandshake,
  Home,
  IdCard,
  Landmark,
  Receipt,
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
];
