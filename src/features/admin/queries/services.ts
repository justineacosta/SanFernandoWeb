import type { AdminServiceRecord } from "@/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveIcon } from "@/lib/icon-map";

/** Services for the admin manager, mapped into the existing AdminServiceRecord shape. */
export async function listServiceCatalog(): Promise<AdminServiceRecord[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, title, description, icon_name, tone, requirements_label, cta_label, requirements, department, is_available, updated_at")
    .order("sort_order", { ascending: true });
  if (error || !data) {
    if (error) console.error("listServiceCatalog failed:", error.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    service: {
      id: row.id,
      title: row.title,
      description: row.description,
      icon: resolveIcon(row.icon_name),
      tone: row.tone as AdminServiceRecord["service"]["tone"],
      requirementsLabel: row.requirements_label,
      requirements: row.requirements,
      ctaLabel: row.cta_label,
    },
    department: row.department,
    status: row.is_available ? "active" : "inactive",
    updatedAt: row.updated_at,
  }));
}
