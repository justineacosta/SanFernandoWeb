import { PhoneCall } from "lucide-react";
import type { Hotline, LinkItem, NavItem } from "@/types";
import barangaySealLogo from "@/images/logo/BarangaySFLogo.png";

export const SITE = {
  name: "Barangay San Fernando",
  republic: "Republic of the Philippines",
  locality: "San Nicolas, Ilocos Norte",
  tagline: "A Progressive Community, A Better Tomorrow.",
  description:
    "We are committed to providing transparent, efficient, and citizen-centered services for a stronger and united community.",
  address: "Barangay San Fernando, San Nicolas, Ilocos Norte, Philippines",
  addressLines: ["Barangay San Fernando,", "San Nicolas, Ilocos Norte, Philippines"],
  phone: "(077) 600 1082",
  /** Same number as `phone`, in dialable E.164 form — use for every `tel:` href. */
  phoneTel: "+63776001082",
  email: "info@brgy-sanfernando.gov.ph",
  officeHours: "Mon - Fri: 8:00 AM - 5:00 PM",
  sealImage: barangaySealLogo,
} as const;

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Officials", href: "/officials" },
  { label: "Services", href: "/services" },
  { label: "Track a Request", href: "/track" },
  { label: "News", href: "/announcements" },
  { label: "Transparency", href: "/transparency" },
  { label: "Contact", href: "/contact" },
];

export const EMERGENCY_HOTLINES: Hotline[] = [
  { label: "Barangay Hotline", number: "(077) 600 1082", icon: PhoneCall },
  // { label: "Tanod / Security", number: "0998 765 4321", icon: ShieldAlert },
  // { label: "Health Center", number: "(077) 987 6543", icon: PlusSquare },
  // { label: "Fire Department", number: "(077) 112 3456", icon: Flame },
  // { label: "PNP - San Nicolas", number: "(077) 321 7654", icon: MapPin },
];

export const GOVERNMENT_LINKS: LinkItem[] = [
  { label: "Official Gazette", href: "https://www.officialgazette.gov.ph", external: true },
  { label: "DILG Philippines", href: "https://www.dilg.gov.ph", external: true },
  { label: "DOH Philippines", href: "https://doh.gov.ph", external: true },
  { label: "DSWD Philippines", href: "https://www.dswd.gov.ph", external: true },
  { label: "PSA Philippines", href: "https://psa.gov.ph", external: true },
];

export const LEGAL_LINKS: NavItem[] = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Use", href: "/terms" },
];
