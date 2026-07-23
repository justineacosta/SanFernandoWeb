import type { Permission, StaffStatusLabel } from "@/types";

export const PERMISSION_LABELS: Record<Permission, string> = {
  "process-applications": "Process certificate applications",
  "process-appointments": "Process appointments",
  "handle-complaints": "Handle complaints",
  "handle-assistance": "Handle assistance requests",
  "handle-inquiries": "Answer inquiries & site feedback",
  "manage-news": "Manage news, announcements & events",
  "manage-officials": "Manage officials",
  "manage-transparency": "Manage transparency documents",
  "manage-site-content": "Edit Home & About page content",
};

export const PERMISSION_GROUPS: { title: string; permissions: Permission[] }[] = [
  {
    title: "Tickets",
    permissions: [
      "process-applications",
      "process-appointments",
      "handle-complaints",
      "handle-assistance",
      "handle-inquiries",
    ],
  },
  {
    title: "Content",
    permissions: [
      "manage-news",
      "manage-officials",
      "manage-transparency",
      "manage-site-content",
    ],
  },
];

/**
 * Pre-ticked checkboxes when the SuperAdmin picks a status label (spec §4).
 *
 * `manage-site-content` is deliberately absent from `editor`. Presets pre-tick
 * boxes for every account created afterwards, so including it would hand the
 * front page to the next editor without anyone deciding to (design §2.10).
 */
export const STATUS_PRESETS: Record<StaffStatusLabel, Permission[]> = {
  staff: [
    "process-applications",
    "process-appointments",
    "handle-complaints",
    "handle-assistance",
    "handle-inquiries",
  ],
  editor: ["manage-news", "manage-officials", "manage-transparency"],
};
