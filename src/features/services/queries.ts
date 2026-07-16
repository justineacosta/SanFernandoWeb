import type { ServiceRecord } from "@/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveIcon } from "@/lib/icon-map";

/** All services for the public directory, ordered for display. */
export async function listServices(): Promise<ServiceRecord[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, title, description, icon_name, tone, requirements_label, cta_label, requirements, department, is_available")
    .order("sort_order", { ascending: true });
  if (error || !data) {
    if (error) console.error("listServices failed:", error.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    icon: resolveIcon(row.icon_name),
    tone: row.tone as ServiceRecord["tone"],
    requirementsLabel: row.requirements_label,
    requirements: row.requirements,
    ctaLabel: row.cta_label,
    isAvailable: row.is_available,
  }));
}
