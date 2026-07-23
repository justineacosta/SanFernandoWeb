import { Mail, MapPin, Phone } from "lucide-react";
import mapImage from "@/images/map/san-fernando-map.png";
import { SITE } from "@/constants/site";
import type { ContactChannel } from "@/types";

export const CONTACT_CHANNELS: ContactChannel[] = [
  {
    label: "Office Address",
    lines: SITE.addressLines.slice(),
    icon: MapPin,
  },
  {
    label: "Phone Number",
    lines: [SITE.phone, "0917-555-6789"],
    icon: Phone,
  },
  {
    label: "Email Address",
    lines: [SITE.email, "helpdesk@brgy-sanfernando.gov.ph"],
    icon: Mail,
  },
];

/**
 * The subject picker on /contact. Stored as text in `inquiries.subject` rather
 * than an enum so the barangay can add a subject without a migration; the
 * Server Action validates the submitted value against this same list.
 */
export const INQUIRY_SUBJECTS = [
  { value: "general", label: "General Inquiry" },
  { value: "documents", label: "Document Request" },
  { value: "complaint", label: "Report / Complaint" },
  { value: "emergency", label: "Non-Emergency Assistance" },
  { value: "others", label: "Others" },
] as const;

export const INQUIRY_SUBJECT_VALUES: readonly string[] = INQUIRY_SUBJECTS.map(
  (subject) => subject.value,
);

/**
 * Display label for a stored subject. Falls back to the raw value so a row
 * written before a subject was renamed still shows something in the inbox.
 */
export function inquirySubjectLabel(value: string): string {
  return INQUIRY_SUBJECTS.find((subject) => subject.value === value)?.label ?? value;
}

/**
 * The barangay map, supplied by the barangay. Bundled like SITE.sealImage
 * rather than served from Storage: one file, no admin surface, changes only
 * when the boundary does.
 */
export const MAP_IMAGE = mapImage;
