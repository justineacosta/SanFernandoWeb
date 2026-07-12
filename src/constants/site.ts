import {
  Facebook,
  Flame,
  MapPin,
  MessageCircle,
  PhoneCall,
  PlusSquare,
  ShieldAlert,
  Twitter,
  Youtube,
} from "lucide-react";
import type { Hotline, LinkItem, NavItem, SocialLink } from "@/types";

export const SITE = {
  name: "Barangay San Fernando",
  republic: "Republic of the Philippines",
  locality: "San Nicolas, Ilocos Norte",
  tagline: "A Progressive Community, A Better Tomorrow.",
  description:
    "We are committed to providing transparent, efficient, and citizen-centered services for a stronger and united community.",
  address: "Barangay San Fernando, San Nicolas, Ilocos Norte, Philippines",
  addressLines: ["Barangay San Fernando,", "San Nicolas, Ilocos Norte, Philippines"],
  phone: "(077) 123 4567",
  email: "info@brgy-sanfernando.gov.ph",
  officeHours: "Mon - Fri: 8:00 AM - 5:00 PM",
  sealImage:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDk9oPBXa9CA9E_ZE09gCrXvjGL6IV4S5glVxuUd3INe1QUVmHo7yx7aNxZd-xarM0lL_WAkfIfn-YAJ8XxxyRdWe7k2Xhqb1G-eSc0iqkF2sNizvsF1lv50lbEMqfuRDSdfJRpDvJ_Ykr2pezQ4t88oyTgaN70621JbTQA0D0L_1kHQqawzqxrBy8Wtp8T4GLEFn-puPDf2hAjZhTJhWy265RLocVbIGd33kTqpjQLr_Yaq48XH5qum-L8FAbYfBenmhA7IgLsnaw",
} as const;

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Officials", href: "/officials" },
  { label: "Services", href: "/services" },
  { label: "News", href: "/announcements" },
  { label: "Transparency", href: "/transparency" },
  { label: "Contact", href: "/contact" },
];

export const EMERGENCY_HOTLINES: Hotline[] = [
  { label: "Barangay Hotline", number: "(077) 123 4567", icon: PhoneCall },
  { label: "Tanod / Security", number: "0998 765 4321", icon: ShieldAlert },
  { label: "Health Center", number: "(077) 987 6543", icon: PlusSquare },
  { label: "Fire Department", number: "(077) 112 3456", icon: Flame },
  { label: "PNP - San Nicolas", number: "(077) 321 7654", icon: MapPin },
];

export const SOCIAL_LINKS: SocialLink[] = [
  { label: "Facebook", href: "#", icon: Facebook },
  { label: "Twitter", href: "#", icon: Twitter },
  { label: "YouTube", href: "#", icon: Youtube },
  { label: "Messenger", href: "#", icon: MessageCircle },
];

export const GOVERNMENT_LINKS: LinkItem[] = [
  { label: "Official Gazette", href: "https://www.officialgazette.gov.ph", external: true },
  { label: "DILG Philippines", href: "https://www.dilg.gov.ph", external: true },
  { label: "DOH Philippines", href: "https://doh.gov.ph", external: true },
  { label: "DSWD Philippines", href: "https://www.dswd.gov.ph", external: true },
  { label: "PSA Philippines", href: "https://psa.gov.ph", external: true },
];

export const LEGAL_LINKS: NavItem[] = [
  { label: "Privacy Policy", href: "#" },
  { label: "Terms of Use", href: "#" },
];
