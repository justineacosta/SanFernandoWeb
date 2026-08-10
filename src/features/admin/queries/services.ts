import type { AdminServiceRow } from "@/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Services for the admin manager as flat, serializable rows (icon stays a name string). */
export async function listServiceCatalog(): Promise<AdminServiceRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, title, description, icon_name, tone, flow, requirements_label, cta_label, requirements, department, is_available, updated_at")
    .order("sort_order", { ascending: true });
  if (error || !data) {
    if (error) console.error("listServiceCatalog failed:", error.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    iconName: row.icon_name,
    tone: row.tone as AdminServiceRow["tone"],
    flow: row.flow as AdminServiceRow["flow"],
    requirementsLabel: row.requirements_label,
    ctaLabel: row.cta_label,
    requirements: row.requirements,
    department: row.department,
    status: row.is_available ? "active" : "inactive",
    // formatDate() expects a bare YYYY-MM-DD; updated_at is a full timestamptz.
    updatedAt: row.updated_at.slice(0, 10),
  }));
}
