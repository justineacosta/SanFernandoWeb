import { Gavel, HeartHandshake, ShieldCheck, Store } from "lucide-react";
import type { Service } from "@/types";

export const SERVICES: Service[] = [
  {
    id: "barangay-clearance",
    title: "Barangay Clearance",
    description:
      "An official document required for various transactions such as employment, business permits, and legal identification.",
    icon: ShieldCheck,
    tone: "primary",
    requirementsLabel: "View Requirements",
    requirements: [
      "Latest Community Tax Certificate (Cedula)",
      "Recent 2x2 colored ID picture (white background)",
      "Application fee: ₱50.00",
    ],
    ctaLabel: "Apply Online",
  },
  {
    id: "business-permit",
    title: "Business Permit Recommendation",
    description:
      "Necessary for local entrepreneurs to operate legally within the barangay jurisdiction, ensuring compliance with local zoning.",
    icon: Store,
    tone: "primary",
    requirementsLabel: "View Requirements",
    requirements: [
      "DTI / SEC Registration Papers",
      "Contract of Lease or Land Title",
      "Locational Clearance",
    ],
    ctaLabel: "Apply Online",
  },
  {
    id: "certificate-of-indigency",
    title: "Certificate of Indigency",
    description:
      "Provided to residents needing social welfare assistance, medical aid, or scholarship applications.",
    icon: HeartHandshake,
    tone: "primary",
    requirementsLabel: "View Requirements",
    requirements: [
      "Voter's ID or Certification",
      "Affidavit of Low Income",
      "Referral from DSWD (if applicable)",
    ],
    ctaLabel: "Apply Online",
  },
  {
    id: "blotter-complaints",
    title: "Blotter & Complaints",
    description:
      "For reporting neighborhood disputes, peace and order issues, or filing formal grievances for mediation.",
    icon: Gavel,
    tone: "danger",
    requirementsLabel: "View Process",
    requirements: [
      "Personal appearance of the complainant",
      "Valid Government ID",
      "Incident narrative and supporting evidence",
    ],
    ctaLabel: "File Incident Report",
  },
];

export const EMERGENCY_ASSISTANCE = {
  title: "Emergency Assistance",
  description:
    "In case of fire, medical emergencies, or urgent security threats, contact our 24/7 Response Team immediately.",
  hotlines: [
    { label: "Hotline", number: "911-SAMPAGUITA" },
    { label: "Ambulance", number: "8-123-4567" },
  ],
};
