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

export const MISSION =
  "To empower every resident of Barangay San Fernando through inclusive local governance, responsive public services, and sustainable community development programs that enhance the quality of life and promote social justice.";

export const VISION =
  "A premier, technology-driven, and disaster-resilient community where citizens live in harmony, safety, and prosperity by the year 2030.";

export const CORE_VALUES: ValueItem[] = [
  { icon: ShieldCheck, title: "Integrity", description: "Honesty in every action." },
  { icon: HeartHandshake, title: "Service", description: "Putting the people first." },
  { icon: Accessibility, title: "Accountability", description: "Answerable to the public." },
  { icon: Leaf, title: "Sustainability", description: "Preserving for the future." },
];

export const CAPTAIN = {
  name: "Hon. Roberto S. Garcia",
  role: "Barangay Captain",
  photo:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuA9OXsw1aa2Z_qUSgKBM12yWtsvOyVBsN0GF0YsLgWcmmZRNZP29WiG1t3NTjn--98v1qWECVAsIRXLRK0JFfv0SG4RghbjM-n9ZxXdgUs14eaYrZ6ky60pul58euMDptq7D1QK8qrEqNmbV_HDFaErkPbL4-8_HcFOXhF__AjiJFiTKrp-l2Ei2fx2jgsKehy49fNfuBjeg8qj50bG1KAAjPoPLXRwzlJR1h-urR--Qj7utoc8Xm0HZEGx6LgV-SWmwPfxenYr68w",
  photoAlt:
    "Portrait of the Barangay Captain wearing a white Barong Tagalog in his office",
  message: [
    "“Ang aming pamunuan ay nakatuon sa pagbibigay ng tapat at mabilis na serbisyo para sa bawat Sampaguiteño. Naniniwala ako na sa pamamagitan ng pagkakaisa at transparency, makakamit natin ang isang mas maunlad at ligtas na barangay.”",
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
