import type { Permission, StaffStatusLabel } from "@/types";

export const PERMISSION_LABELS: Record<Permission, string> = {
  "process-applications": "Process certificate applications",
  "process-appointments": "Process appointments",
  "handle-complaints": "Handle complaints",
  "handle-assistance": "Handle assistance requests",
  "manage-news": "Manage news, announcements & events",
  "manage-officials": "Manage officials",
  "manage-transparency": "Manage transparency documents",
};

export const PERMISSION_GROUPS: { title: string; permissions: Permission[] }[] = [
  {
    title: "Tickets",
    permissions: [
      "process-applications",
      "process-appointments",
      "handle-complaints",
      "handle-assistance",
    ],
  },
  {
    title: "Content",
    permissions: ["manage-news", "manage-officials", "manage-transparency"],
  },
];

/** Pre-ticked checkboxes when the SuperAdmin picks a status label (spec §4). */
export const STATUS_PRESETS: Record<StaffStatusLabel, Permission[]> = {
  staff: [
    "process-applications",
    "process-appointments",
    "handle-complaints",
    "handle-assistance",
  ],
  editor: ["manage-news", "manage-officials", "manage-transparency"],
};
