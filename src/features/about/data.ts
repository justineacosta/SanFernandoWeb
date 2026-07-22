import punongBarangayPhoto from "@/images/officials/Punong Barangay - Domini B. Dela Cruz.jpg";

// Fallback values only: name/role/photo are normally read live from the
// officials table (see getPublishedExecutiveOfficial) so an election only
// has to be recorded once. These keep the About page correct if that query
// ever returns null (missing migration, Supabase outage, etc). The captain's
// message is no longer here — it is a CMS block (`about.captain_message`,
// design §2.1) and has no static fallback, because a blanked one is a choice
// the editor made.
export const CAPTAIN = {
  name: "Dominic B. Dela Cruz",
  role: "Punong Barangay",
  photo: punongBarangayPhoto,
  photoAlt: "Portrait of Punong Barangay Dominic B. Dela Cruz",
};
