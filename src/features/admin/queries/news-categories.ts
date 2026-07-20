import "server-only";
import type { NewsCategoryRow } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** All categories (active and retired) for the SuperAdmin editor. */
export async function listNewsCategories(): Promise<NewsCategoryRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("news_categories")
    .select("id, label, sort_order, is_active")
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, label: r.label, sortOrder: r.sort_order, isActive: r.is_active }));
}
