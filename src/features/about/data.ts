import {
  Accessibility,
  Droplets,
  HeartHandshake,
  Leaf,
  Recycle,
  ShieldCheck,
} from "lucide-react";
import type { Milestone, TimelineEntry, ValueItem } from "@/types";
import punongBarangayPhoto from "@/images/officials/Punong Barangay - Domini B. Dela Cruz.jpg";
import barangaySeal from "@/images/logo/BarangaySFLogo.png";
import communityPhoto from "@/images/carousel/OrganizationGroupPicture.jpg";

export const MISSION =
  "To promote people participation; To provide a business-friendly environment for business investors; To ensure public safety, peace and order in the community; To sustain a clean and green environment thru intensified clean and green program implementation; and To enhance capability of barangay leaders.";

export const VISION =
  "A progressive, industrialized and business friendly barangay with developed economy, God-loving, united and cooperative citizenry who lives in a peaceful, orderly and ecologically balanced environment under a firm, innovative, transparent, accountable and proactive leadership by 2026.";

export const CORE_VALUES: ValueItem[] = [
  { icon: ShieldCheck, title: "Integrity", description: "Honesty in every action." },
  { icon: HeartHandshake, title: "Service", description: "Putting the people first." },
  { icon: Accessibility, title: "Accountability", description: "Answerable to the public." },
  { icon: Leaf, title: "Sustainability", description: "Preserving for the future." },
];

export const CAPTAIN = {
  name: "Dominic B. Dela Cruz",
  role: "Barangay Captain",
  photo: punongBarangayPhoto,
  photoAlt: "Portrait of Punong Barangay Dominic B. Dela Cruz",
  message: [
    "“Ang aming pamunuan ay nakatuon sa pagbibigay ng tapat at mabilis na serbisyo para sa lahat. Naniniwala ako na sa pamamagitan ng pagkakaisa at transparency, makakamit natin ang isang mas maunlad at ligtas na barangay.”",
    "“It is our honor to serve this historic community. We are modernizing our systems to ensure that no one is left behind in our journey toward a digital and efficient local government. Maraming salamat sa inyong patuloy na pagtitiwala.”",
  ],
};

export const HISTORY_TIMELINE: TimelineEntry[] = [
  {
    year: "1733",
    title: "Founding",
    description:
      "Barangay 11 San Fernando was founded in 1733 — one of the barangays of San Nicolas named after saints, according to the History of San Nicolas by Atty. Manuel F. Aurelio.",
    image: barangaySeal,
    imageFit: "contain",
    imageAlt: "Official seal of Barangay San Fernando, San Nicolas, Ilocos Norte",
  },
  {
    year: "Today",
    title: "An Urban Poblacion Barangay",
    description:
      "San Fernando is one of the 15 urban barangays surrounding the center of San Nicolas — 8.95 hectares and seven sitios that are home to about 1,228 residents (RBI 2024). It is bounded by San Ildefonso, San Paulo, San Cayetano, and San Guillermo, just 250 meters from the Municipal Hall along the Manila North Road.",
    image: communityPhoto,
    imageAlt: "Barangay officials and residents gathered for a community group photo",
  },
];

export const MILESTONES: Milestone[] = [
  {
    icon: Leaf,
    title: "Weekly Community Clean-Up Drive",
    description:
      "Residents join barangay officials, SK officials, health workers, and tanods in the mandatory weekly clean-up of roads, canals, and vacant lots.",
    meta: "Barangay Development Plan",
  },
  {
    icon: Recycle,
    title: "100% Household Waste Segregation",
    description:
      "All 248 households segregate their garbage and are covered by scheduled barangay-wide collection.",
    meta: "RBI 2024",
  },
  {
    icon: Droplets,
    title: "Flood Mitigation Through Canal Rehabilitation",
    description:
      "As the catch basin of neighboring barangays, San Fernando rehabilitated its canals so typhoon floodwater now subsides quickly.",
    meta: "Barangay Development Plan",
  },
];
