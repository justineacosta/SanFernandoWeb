import {
  Gavel,
  HeartHandshake,
  ShieldCheck,
  Store,
  FileText,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps stored icon-name strings to Lucide components. The DB (and any future
 * API) stores names, never components — resolve them here on the frontend.
 * Extend this map as new services introduce new icons.
 */
const ICONS: Record<string, LucideIcon> = {
  "shield-check": ShieldCheck,
  store: Store,
  "heart-handshake": HeartHandshake,
  gavel: Gavel,
  "file-text": FileText,
};

/** Resolve an icon name to a component, falling back to a neutral document icon. */
export function resolveIcon(name: string): LucideIcon {
  return ICONS[name] ?? FileText;
}
