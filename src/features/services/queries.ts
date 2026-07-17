import { cache } from "react";
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

/**
 * One service for the apply page. Returns null when the slug is unknown or the
 * service is a `danger`-toned one — those are the complaint flow (plan 2C), not
 * applications. An unavailable service still resolves; the page renders a
 * "temporarily unavailable" notice rather than a 404, which reads better to a
 * resident who followed a link.
 *
 * Cached per request: generateMetadata and the page body both call this, and
 * without it that is two round-trips for the same row.
 */
export const getApplyService = cache(async (slug: string): Promise<ServiceRecord | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, title, description, icon_name, tone, requirements_label, cta_label, requirements, department, is_available")
    .eq("id", slug)
    .maybeSingle();
  if (error || !data || data.tone !== "primary") {
    if (error) console.error("getApplyService failed:", error.message);
    return null;
  }

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    icon: resolveIcon(data.icon_name),
    tone: data.tone as ServiceRecord["tone"],
    requirementsLabel: data.requirements_label,
    requirements: data.requirements,
    ctaLabel: data.cta_label,
    isAvailable: data.is_available,
  };
});
