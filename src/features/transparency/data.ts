import { FileBarChart, FileText, Gavel, LineChart } from "lucide-react";
import type { LegislativeDocument, ProjectStatus, TransparencyDocument } from "@/types";

export const HERO_IMAGE =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCP9JMh18k0w9QqfcGgqjh02z3qWVaW3pGR7c0EIUk8-z6uj417G2VD5fpvYeA_b4y8ibNZFFjoG1ojbK0I0YLyHcCUyio6GTmsJKQm1lPsFq3uYgf0Bl28lyjuwMKhPvOvnea215p7hEw_8YfzJ3uPoud_Z43F9eEENKpafgTAA3q-OZVuFHSVJ4_z8QXGyuUgmw4d9tYJ9ocQVt_XowodloaflafnS9h-h105TVfROngXdxzW8o_bJNDSnVuDuCb2WwJfBpDPU0Q";

export const BUDGET_DOCUMENTS = ["2024 Approved Budget", "2023 Expenditure Report"];

export const PROJECTS: ProjectStatus[] = [
  { name: "Barangay Hall Renovation", progress: 100 },
  { name: "Main Road Lighting Phase II", progress: 65 },
];

export const LATEST_UPLOADS: TransparencyDocument[] = [
  {
    title: "2024 Q3 Income Statement",
    category: "Financials",
    date: "2024-10-12",
    icon: FileBarChart,
  },
  {
    title: "Ordinance No. 05-2024: Waste Management",
    category: "Legislative",
    date: "2024-09-28",
    icon: Gavel,
  },
  {
    title: "Road Improvement Project Report",
    category: "Projects",
    date: "2024-09-15",
    icon: LineChart,
  },
  {
    title: "Seal of Good Governance Certificate",
    category: "Awards",
    date: "2024-08-20",
    icon: FileText,
  },
];

export const ORDINANCES: LegislativeDocument[] = [
  {
    number: "Ordinance No. 05-2024",
    title: "Comprehensive Solid Waste Management Program",
    date: "2024-09-28",
    summary:
      "An ordinance institutionalizing waste segregation at source in all households and establishments within Barangay San Fernando, prescribing collection schedules per purok, designating materials recovery facilities, and providing penalties of ₱500 to ₱2,500 for non-compliance. Enacted pursuant to RA 9003 (Ecological Solid Waste Management Act).",
    fileUrl: "#",
  },
  {
    number: "Ordinance No. 03-2024",
    title: "Curfew Hours for Minors",
    date: "2024-06-14",
    summary:
      "An ordinance setting curfew hours for minors below 18 years of age from 10:00 PM to 4:00 AM daily, defining exemptions for work, school, and emergencies, and directing barangay tanods to escort apprehended minors to their parents or guardians. First offense carries a written warning; succeeding offenses require parental conference with the Lupon.",
    fileUrl: "#",
  },
  {
    number: "Ordinance No. 11-2023",
    title: "Anti-Illegal Parking on Barangay Roads",
    date: "2023-11-08",
    summary:
      "An ordinance prohibiting the parking of motor vehicles on designated barangay road sections that obstruct traffic flow or emergency access, establishing towing and impounding procedures in coordination with the city traffic office, and imposing graduated fines starting at ₱1,000.",
    fileUrl: "#",
  },
];

export const RESOLUTIONS: LegislativeDocument[] = [
  {
    number: "Resolution No. 12-2024",
    title: "Adopting the Annual Budget for Fiscal Year 2025",
    date: "2024-10-05",
    summary:
      "A resolution adopting the proposed annual budget of Barangay San Fernando for fiscal year 2025 amounting to ₱8,450,000, allocating 20% to the Barangay Development Fund, 10% to the Sangguniang Kabataan fund, and 5% to the Barangay Disaster Risk Reduction and Management Fund, as reviewed by the Barangay Development Council.",
    fileUrl: "#",
  },
  {
    number: "Resolution No. 09-2024",
    title: "Authorizing a Memorandum of Agreement for the Feeding Program",
    date: "2024-07-19",
    summary:
      "A resolution authorizing the Punong Barangay to enter into a memorandum of agreement with the Municipal Social Welfare and Development Office for the implementation of a six-month supplemental feeding program benefiting 120 undernourished children in the barangay day care centers.",
    fileUrl: "#",
  },
  {
    number: "Resolution No. 04-2024",
    title: "Requesting Streetlight Installation Along San Fernando Extension",
    date: "2024-03-22",
    summary:
      "A resolution respectfully requesting the Municipal Engineering Office to install fifteen (15) LED streetlights along San Fernando Extension from Purok 3 to Purok 5, citing recorded safety incidents and the results of the barangay assembly consultation held February 2024.",
    fileUrl: "#",
  },
];
