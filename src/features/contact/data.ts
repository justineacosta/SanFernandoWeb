import { Mail, MapPin, Phone } from "lucide-react";
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
    lines: [SITE.email, "helpdesk@brgy-sampaguita.gov.ph"],
    icon: Mail,
  },
];

export const INQUIRY_SUBJECTS = [
  { value: "general", label: "General Inquiry" },
  { value: "documents", label: "Document Request" },
  { value: "complaint", label: "Report / Complaint" },
  { value: "emergency", label: "Non-Emergency Assistance" },
  { value: "others", label: "Others" },
];

export const MAP_IMAGE =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDAkBIJIGnHT97sdIP82suABS7zH2anKDrIB1ggPIeT3aRJBCia91GRdsvjF-bJOn6dUqz0zCa8XhlCJbkKRDFW843spLGy8DrYBc6HyHJ_wDXnneXxcySQIKkDqq-Do4KfbzQFh4bldTYYPygYf1dqtCZfat0ztk4u6ZKMBlgPwhnOw2ul6Cc8dFGmcpy1DpRMoD-P6C4wUAiaC8OzzMUojawPD4Lcz9t_FYq-W42Txyv0NYF2ACGflY0k9kKVosgtKNLfk1MQeik";
