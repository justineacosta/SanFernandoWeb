import { cache } from "react";
import type { AssistanceCategoryRow } from "@/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The picker list for the public assistance form. Retired categories
 * (`is_active = false`) are hidden here but still resolve on existing requests —
 * that is why they are retired rather than deleted.
 *
 * Cached per request: the page body and the form's empty-state check both ask.
 */
export const listActiveAssistanceCategories = cache(async (): Promise<AssistanceCategoryRow[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("assistance_categories")
    .select("id, label, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error || !data) {
    if (error) console.error("listActiveAssistanceCategories failed:", error.message);
    return [];
  }
  return data.map((row) => ({
    id: row.id,
    label: row.label,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }));
});
