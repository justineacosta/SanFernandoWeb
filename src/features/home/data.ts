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
import type {
  Announcement,
  CommunityEvent,
  HeroSlide,
  QuickService,
  Stat,
  ValueItem,
} from "@/types";

export const HERO_IMAGE =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuB6faUsk_X5aG7dJSCaPD0iynJ9zyUAOQ31BcXvBKmyxNUWIVmPeUMDNkrXBjdfD5Sbh3RwnnPysj_RxfrMhBwTPGb-BP4mDyyH5pBOrh8ofsySWtfjhE3jGUBJUtHisLpGRFiJHiyO1HwFQEw8KYPLhWDyvG3jUzkKqxH9lIEQZya9ZR5D_Ojw3nN6wAa9ciR_WqVt8F-e2sR_Oh-HFrXZISx48HxChtUdNXfk1pngRXYLGnffZle8eZLdxxT5pWYCjvLGSEkFhNY";

export const CTA_IMAGE =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDdUZq8tdAhUP0f1C3psoNXrr7LYQFX_4T6TL0OjRcM0zwxNFRi3Syn7EBYV9Vh3XhVTmfY_wz2-9d2Gowg6-C4aBHMmP5G3FIkuoLomUFq5cRZ041Bp8nRb9KX4ylWdytodNwOBZeFzuKDGNJ_uoLas3SuyV1tme8Unz0JoXnWTC-6v-BnV5IWyVX70-H0oqLiWjLZFG48zxBKvRdJrr8FEsSWNlhRDeGlLorF3NvaUGRej6MN-GkAhgojKlOmgtHIqPT5eMSs2QY";

/** Home hero carousel slides. Placeholder images until real barangay photos are provided. */
export const HERO_SLIDES: HeroSlide[] = [
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuB6faUsk_X5aG7dJSCaPD0iynJ9zyUAOQ31BcXvBKmyxNUWIVmPeUMDNkrXBjdfD5Sbh3RwnnPysj_RxfrMhBwTPGb-BP4mDyyH5pBOrh8ofsySWtfjhE3jGUBJUtHisLpGRFiJHiyO1HwFQEw8KYPLhWDyvG3jUzkKqxH9lIEQZya9ZR5D_Ojw3nN6wAa9ciR_WqVt8F-e2sR_Oh-HFrXZISx48HxChtUdNXfk1pngRXYLGnffZle8eZLdxxT5pWYCjvLGSEkFhNY",
    alt: "Barangay San Fernando community",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuDdUZq8tdAhUP0f1C3psoNXrr7LYQFX_4T6TL0OjRcM0zwxNFRi3Syn7EBYV9Vh3XhVTmfY_wz2-9d2Gowg6-C4aBHMmP5G3FIkuoLomUFq5cRZ041Bp8nRb9KX4ylWdytodNwOBZeFzuKDGNJ_uoLas3SuyV1tme8Unz0JoXnWTC-6v-BnV5IWyVX70-H0oqLiWjLZFG48zxBKvRdJrr8FEsSWNlhRDeGlLorF3NvaUGRej6MN-GkAhgojKlOmgtHIqPT5eMSs2QY",
    alt: "Community members joining a barangay program",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuAKfX6kI2fekmRPUd1kE_O3EyuEA3gJBN7KbNJDLjXz1PYGsNn8myyZZFhbbGnpIeJy711seRjFGNjzfgJJdN1_4JCKTETETxt_Qey4QEJ8cyiyPU2l9b_qB-HLlkwi9reMFdSd0b8LbCrY5AkFxFJvPLTHF-UpjNkyazbr4gVeTVo71J3OEJEqVDi46slsj_oc8JcjUShpuGlDyHCccCPsQAkf0lEW4spWv-w4YL9D0fJp_v3CXRVXoSwVDPQWzMXvMg6jDS_CObk",
    alt: "Residents gathered for a barangay assembly",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuBQMEWS1CFwllE8d9raqgMitrZe3lxxzWXQ3Bcl2I1HXP7eHqHEK-hqYJgyWkH3UD0brZRExGSa6WZnAViKeIXMh8s0B4saCQjR7DrQUVlkYtWz7hleSkf5wufO4vDDEmqkDlv8z6bMCyl0t04YwZws14Lx0jGXLoOWgFmGq-2O9kHlhu5ab9-ojY4N96RIQVx5QlNdldjOaujdC7lDoqUfEQxtEysVrhbjng7EVEHi9Z_d91NIpXXDZFAILNbLfieTKvuefXZDugY",
    alt: "Health workers during a medical mission",
  },
];

export const QUICK_SERVICES: QuickService[] = [
  { title: "Barangay Clearance", ctaLabel: "Apply Online", href: "/services", icon: FileText },
  { title: "Certificate Requests", ctaLabel: "Request Now", href: "/services", icon: FileBadge },
  { title: "Set an Appointment", ctaLabel: "Book Now", href: "/contact", icon: CalendarDays },
  { title: "File a Complaint", ctaLabel: "Submit Online", href: "/services", icon: FileEdit },
  { title: "Business Permit", ctaLabel: "Apply Now", href: "/services", icon: Store },
  {
    title: "Social Services Assistance",
    ctaLabel: "Learn More",
    href: "/services",
    icon: HeartHandshake,
  },
];

export const LATEST_ANNOUNCEMENTS: Announcement[] = [
  {
    title: "Schedule of Barangay Assembly Meeting",
    date: "2025-05-20",
    excerpt: "Please be informed that the monthly barangay assembly meeting will be...",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAKfX6kI2fekmRPUd1kE_O3EyuEA3gJBN7KbNJDLjXz1PYGsNn8myyZZFhbbGnpIeJy711seRjFGNjzfgJJdN1_4JCKTETETxt_Qey4QEJ8cyiyPU2l9b_qB-HLlkwi9reMFdSd0b8LbCrY5AkFxFJvPLTHF-UpjNkyazbr4gVeTVo71J3OEJEqVDi46slsj_oc8JcjUShpuGlDyHCccCPsQAkf0lEW4spWv-w4YL9D0fJp_v3CXRVXoSwVDPQWzMXvMg6jDS_CObk",
    imageAlt: "Residents gathered for a barangay assembly",
    isNew: true,
  },
  {
    title: "Free Medical Mission this May 25, 2025",
    date: "2025-05-18",
    excerpt: "The barangay will conduct a free medical and dental mission for all...",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBQMEWS1CFwllE8d9raqgMitrZe3lxxzWXQ3Bcl2I1HXP7eHqHEK-hqYJgyWkH3UD0brZRExGSa6WZnAViKeIXMh8s0B4saCQjR7DrQUVlkYtWz7hleSkf5wufO4vDDEmqkDlv8z6bMCyl0t04YwZws14Lx0jGXLoOWgFmGq-2O9kHlhu5ab9-ojY4N96RIQVx5QlNdldjOaujdC7lDoqUfEQxtEysVrhbjng7EVEHi9Z_d91NIpXXDZFAILNbLfieTKvuefXZDugY",
    imageAlt: "Health workers during a medical mission",
  },
  {
    title: "Payment Reminder: Real Property Taxes",
    date: "2025-05-15",
    excerpt: "Reminder to all residents to pay your real property taxes on or before...",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuA-F-YU1-cDY2RfHTUjhpq3Z6g64xVXM3PiijdiMf612o4vIWHDAOnMGuIjt7eHS6XFdN_kB61vI0lXAiAdpr0nU030Osnu9LSFNDomIdj-S-p-NoVr_hIM_nPyucGj5Xy59GtevG5n8sPFZAI8CPjcDN6xBX--UCUk6DFKJbLzomdlPAhx2u9RwSfme4hphzokaq-WUNUv-DO5wj1Adt5qRoE0zOpBonYTgfxt-ArNZxQblc8jnMHOjP5iMweyuy9gLvafVzQ0mF8",
    imageAlt: "Tax documents and a calculator",
  },
];

export const UPCOMING_EVENTS: CommunityEvent[] = [
  {
    title: "Medical & Dental Mission",
    date: "2025-05-25",
    time: "8:00 AM - 3:00 PM",
    venue: "Barangay Covered Court",
  },
  {
    title: "Youth Leadership Seminar",
    date: "2025-05-30",
    time: "9:00 AM - 12:00 PM",
    venue: "Barangay Hall",
  },
  {
    title: "Environment Clean-up Drive",
    date: "2025-06-05",
    time: "6:00 AM - 10:00 AM",
    venue: "Barangay San Fernando",
  },
  {
    title: "Senior Citizens Gathering",
    date: "2025-06-12",
    time: "1:00 PM - 5:00 PM",
    venue: "Barangay Hall",
  },
];

export const GLANCE_STATS: Stat[] = [
  { label: "Total Population", value: "4,532", note: "as of 2024", icon: Users },
  { label: "Households", value: "1,256", note: "as of 2024", icon: Home },
  { label: "Total Land Area", value: "2.35 km²", icon: Map },
  { label: "Puroks", value: "6", note: "Active Puroks", icon: LayoutGrid },
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
