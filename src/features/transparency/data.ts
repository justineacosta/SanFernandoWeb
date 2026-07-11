import { FileBarChart, FileText, Gavel, LineChart } from "lucide-react";
import type { ProjectStatus, TransparencyDocument } from "@/types";

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
