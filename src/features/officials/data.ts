import type { Official } from "@/types";
// All portraits are real barangay photos bundled from `src/images/officials/` via
// static imports. Names are real; emails and phone numbers are still placeholder-shaped.
import punongBarangayPhoto from "@/images/officials/Punong Barangay - Domini B. Dela Cruz.jpg";
import kagawad1Photo from "@/images/officials/Kagawad No. 1 - Hon. Geroly B. Aggasid.png";
import kagawad2Photo from "@/images/officials/Kagawad No. 2 - Hon. Ronnel T. Paguirigan.png";
import kagawad3Photo from "@/images/officials/Kagawad No. 3 - Hon. Segundo T. Butay.png";
import kagawad4Photo from "@/images/officials/Kagawad No. 4 - Hon. Noel A. Ribao.png";
import kagawad5Photo from "@/images/officials/Kagawad No. 5 - Hon. Ruthsen Faye M. Gonzales.png";
import kagawad6Photo from "@/images/officials/Kagawad No. 6 - Hon. Lydia B. Butay.png";
import kagawad7Photo from "@/images/officials/Kagawad No. 7 - Hon. Mariene A. Butay.png";
import skChairmanPhoto from "@/images/officials/Barangay SK Chairman - Hon. Jake B. De La Cruz.png";
import secretaryPhoto from "@/images/officials/Barangay Secretary - Sharah Mae R. Lagundi.png";
import treasurerPhoto from "@/images/officials/Barangay Treasurer - Mariela A. Tolentino.png";
import adminAssistantPhoto from "@/images/officials/Barangay Administrative Assistant - Mary Kaye A. Maltezo.png";

export const TERM_LABEL = "2023-2025";

export const OFFICIALS: Official[] = [
  {
    name: "Hon. Dominic B. Dela Cruz",
    role: "Punong Barangay",
    group: "executive",
    photo: punongBarangayPhoto,
    photoAlt: "Portrait of Punong Barangay Dominic B. Dela Cruz",
    email: "captain@sanfernando.gov.ph",
    phone: "+63 912 345 6789",
  },
  {
    name: "Hon. Geroly B. Aggasid",
    role: "Barangay Kagawad",
    group: "council",
    photo: kagawad1Photo,
    photoAlt: "Portrait of Kagawad Geroly B. Aggasid",
    email: "g.aggasid@sanfernando.gov.ph",
    phone: "(077) 123 4571",
  },
  {
    name: "Hon. Ronnel T. Paguirigan",
    role: "Barangay Kagawad",
    group: "council",
    photo: kagawad2Photo,
    photoAlt: "Portrait of Kagawad Ronnel T. Paguirigan",
    email: "r.paguirigan@sanfernando.gov.ph",
    phone: "(077) 123 4572",
  },
  {
    name: "Hon. Segundo T. Butay",
    role: "Barangay Kagawad",
    group: "council",
    photo: kagawad3Photo,
    photoAlt: "Portrait of Kagawad Segundo T. Butay",
    email: "s.butay@sanfernando.gov.ph",
    phone: "(077) 123 4573",
  },
  {
    name: "Hon. Noel A. Ribao",
    role: "Barangay Kagawad",
    group: "council",
    photo: kagawad4Photo,
    photoAlt: "Portrait of Kagawad Noel A. Ribao",
    email: "n.ribao@sanfernando.gov.ph",
    phone: "(077) 123 4574",
  },
  {
    name: "Hon. Ruthsen Faye M. Gonzales",
    role: "Barangay Kagawad",
    group: "council",
    photo: kagawad5Photo,
    photoAlt: "Portrait of Kagawad Ruthsen Faye M. Gonzales",
    email: "r.gonzales@sanfernando.gov.ph",
    phone: "(077) 123 4575",
  },
  {
    name: "Hon. Lydia B. Butay",
    role: "Barangay Kagawad",
    group: "council",
    photo: kagawad6Photo,
    photoAlt: "Portrait of Kagawad Lydia B. Butay",
    email: "l.butay@sanfernando.gov.ph",
    phone: "(077) 123 4576",
  },
  {
    name: "Hon. Mariene A. Butay",
    role: "Barangay Kagawad",
    group: "council",
    photo: kagawad7Photo,
    photoAlt: "Portrait of Kagawad Mariene A. Butay",
    email: "m.butay@sanfernando.gov.ph",
    phone: "(077) 123 4577",
  },
  {
    name: "Hon. Jake B. De La Cruz",
    role: "SK Chairman",
    group: "council",
    badge: "Youth Leader",
    photo: skChairmanPhoto,
    photoAlt: "Portrait of SK Chairman Jake B. De La Cruz",
    email: "sk@sanfernando.gov.ph",
    phone: "(077) 123 4578",
  },
  {
    name: "Ms. Sharah Mae R. Lagundi",
    role: "Barangay Secretary",
    group: "administration",
    photo: secretaryPhoto,
    photoAlt: "Portrait of Barangay Secretary Sharah Mae R. Lagundi",
    email: "secretary@sanfernando.gov.ph",
    phone: "(077) 123 4568",
  },
  {
    name: "Ms. Mariela A. Tolentino",
    role: "Barangay Treasurer",
    group: "administration",
    photo: treasurerPhoto,
    photoAlt: "Portrait of Barangay Treasurer Mariela A. Tolentino",
    email: "treasurer@sanfernando.gov.ph",
    phone: "(077) 123 4569",
  },
  {
    name: "Ms. Mary Kaye A. Maltezo",
    role: "Barangay Administrative Assistant",
    group: "administration",
    photo: adminAssistantPhoto,
    photoAlt: "Portrait of Barangay Administrative Assistant Mary Kaye A. Maltezo",
    email: "admin@sanfernando.gov.ph",
    phone: "(077) 123 4570",
  },
];

export const getOfficialsByGroup = (group: Official["group"]) =>
  OFFICIALS.filter((official) => official.group === group);
