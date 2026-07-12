import {
  Accessibility,
  HeartHandshake,
  Leaf,
  ShieldCheck,
  Stethoscope,
  Trophy,
  Video,
} from "lucide-react";
import type { Milestone, TimelineEntry, ValueItem } from "@/types";
import punongBarangayPhoto from "@/images/officials/Punong Barangay - Domini B. Dela Cruz.jpg";

export const MISSION =
  "To promoted people participation; To provide a business-friendly environment for business investors; To ensure public safety, peace and order in the community; To sustain a clean and green environment thru intensified clean and green program implementation; and To enhance capability of barangay leaders.";

export const VISION =
  "A progressive, industrialized and business friendly barangay with developed economy, god loving, united and cooperative citizenry who lives in a peaceful, orderly and ecologically balanced environment under a firm, innovative, transparent, accountable and proactive leadership by 2026.";

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
    year: "1952",
    title: "Foundation",
    description:
      "Originally part of the sprawling agricultural estates, Barangay San Fernando was formally established to serve the growing community of settlers.",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBHmnHEnbZXmdv4Keaioe2SGecj73lnM5EVvYKoH9N5vQQnCK4y1ZM8H3HEUWY3ghjCZtMQ2D0PAe0t0dauW5xop-WCeYX8vD9ZfKZqdok3CxIPAG9TPAxd3qftPt2QK4QIP66J3EE7j-BFeX97kj4BIHj-JN4BM4Swq8gWzvusEUS6RgrL5ZSM7vw2z9eXtNizngellAIRdJgauRtdcmthr3q6erU482oMR-E6CemLoyvcWFpT4CIH_HOWhlSTqW6N-HjfAl-ehDY",
    imageAlt: "Vintage photograph of community leaders at the barangay's founding",
  },
  {
    year: "1985",
    title: "Urban Transformation",
    description:
      "The completion of the major highway connecting the barangay to the city center sparked a period of rapid residential and commercial growth.",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBTijX7Uvp4k47o_9FVoHoLzYZfjRhfNsZrc6mEnK001jcF5d53VlHRjAimOqwvUZjj136-6y4R9SNX23Uc3DLwsWXqNKb8qN6K2PWxc4pDkoETmU3CujHY41eeA5loU0jg-AI7lXMRs7eiDp_WWrn5Zz0l1YJmNHUG_KyXUi4LnghSl3U397BnPyOOrSCT9MuiE3ohNLHe9v3vcJhlebLAR47p_kAPaWGB7DqiOlssMYEf0DDZtzkXgKvyIb4ATxo08njHQWDVMOM",
    imageAlt: "1980s photograph of road construction through the barangay",
  },
  {
    year: "2021",
    title: "Digital Modernization",
    description:
      "Launch of the e-Barangay Portal, becoming the first in the region to digitize all resident certifications and health tracking services.",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDl3Ow_bdWJcZphiL4NDHt98LWWFHX-3VnIZxRawqYKy_xxTP8_ZvGLGKVQzza30FU2aKSVTfkC2iqkZfwvDCwK3XnjtZqL9VEVjrwjH-l-kqUv8xtSmquE042b2mqFd1kB-z_VVT4O0mTGL0C2oI_DpX0z7l9Eq_geyJmF8db2Oc0h13nqzXfd_2N49ZrBhBIRpLKCL-4kxhICCsxX5Q_Za6p4WlSKZYq9uM18uduFNJczdDb9ju1CXbA9GRVFj7vT0qcNDeDyf-o",
    imageAlt: "Resident using a digital kiosk inside the modern barangay hall",
  },
];

export const MILESTONES: Milestone[] = [
  {
    icon: Trophy,
    title: "Cleanest Barangay Award",
    description:
      "Recognized for three consecutive years for excellence in solid waste management and urban greening initiatives.",
    meta: "Awarded Nov 2023",
  },
  {
    icon: Stethoscope,
    title: "98% Vaccination Rate",
    description:
      "Achieved one of the highest primary healthcare coverage rates in the city through our mobile health clinic program.",
    meta: "Status as of 2024",
  },
  {
    icon: Video,
    title: "Smart CCTV Network",
    description:
      "Successfully implemented a 24/7 surveillance grid covering 100% of major intersections for community safety.",
    meta: "Completed Dec 2023",
  },
];
