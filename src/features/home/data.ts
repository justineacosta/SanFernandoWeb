import {
  Bell,
  CalendarDays,
  FileBadge,
  FileEdit,
  FileText,
  HeartHandshake,
  Heart,
  Home,
  LayoutGrid,
  Map,
  MessageSquare,
  Store,
  Users,
} from "lucide-react";
import type { HeroSlide, QuickService, Stat, ValueItem } from "@/types";
import certificate from "@/images/carousel/Certificate.jpg";
import organizationGroupPicture from "@/images/carousel/OrganizationGroupPicture.jpg";
import cleaningOperation from "@/images/carousel/CleaningOperation.jpg";
import trickOrTreat from "@/images/carousel/TrickOrTreat.jpg";

export const CTA_IMAGE =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDdUZq8tdAhUP0f1C3psoNXrr7LYQFX_4T6TL0OjRcM0zwxNFRi3Syn7EBYV9Vh3XhVTmfY_wz2-9d2Gowg6-C4aBHMmP5G3FIkuoLomUFq5cRZ041Bp8nRb9KX4ylWdytodNwOBZeFzuKDGNJ_uoLas3SuyV1tme8Unz0JoXnWTC-6v-BnV5IWyVX70-H0oqLiWjLZFG48zxBKvRdJrr8FEsSWNlhRDeGlLorF3NvaUGRej6MN-GkAhgojKlOmgtHIqPT5eMSs2QY";

/** Home hero carousel slides — real barangay photos bundled from `src/images/carousel/`. */
export const HERO_SLIDES: HeroSlide[] = [
  {
    src: certificate,
    alt: "Certificate recognizing Barangay San Fernando as an Active Clean-up Partner of San Nicolas",
  },
  {
    src: organizationGroupPicture,
    alt: "Barangay San Fernando officials and volunteers gathered at the barangay hall",
  },
  {
    src: cleaningOperation,
    alt: "Residents clearing branches during a community clean-up drive",
  },
  {
    src: trickOrTreat,
    alt: "Children in costumes receiving treats during a barangay trick-or-treat event",
  },
];

export const QUICK_SERVICES: QuickService[] = [
  { title: "Barangay Clearance", ctaLabel: "Apply Online", href: "/services", icon: FileText },
  { title: "Certificate Requests", ctaLabel: "Request Now", href: "/services", icon: FileBadge },
  { title: "Set an Appointment", ctaLabel: "Book Now", href: "/appointments/new", icon: CalendarDays },
  { title: "File a Complaint", ctaLabel: "Submit Online", href: "/complaints/new", icon: FileEdit },
  { title: "Business Permit", ctaLabel: "Apply Now", href: "/services", icon: Store },
  {
    title: "Social Services Assistance",
    ctaLabel: "Request Now",
    href: "/assistance/new",
    icon: HeartHandshake,
  },
];

export const GLANCE_STATS: Stat[] = [
  { label: "Total Population", value: "1,228", note: "as of 2024", icon: Users },
  { label: "Households", value: "248", note: "as of 2024", icon: Home },
  { label: "Total Land Area", value: "8.95 ha", icon: Map },
  { label: "Puroks", value: "7", note: "Active Puroks", icon: LayoutGrid },
];

export const INVOLVEMENT_ITEMS: ValueItem[] = [
  { icon: Users, title: "Participate", description: "Join barangay activities and programs." },
  { icon: Heart, title: "Volunteer", description: "Be a volunteer and help your community." },
  {
    icon: MessageSquare,
    title: "Give Feedback",
    description: "We value your opinion. Help us improve.",
  },
  { icon: Bell, title: "Stay Updated", description: "Get the latest news and announcements." },
];
