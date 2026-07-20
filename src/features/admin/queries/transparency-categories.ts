import "server-only";
import type { TransparencyCategoryRow } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function listTransparencyCategories(): Promise<TransparencyCategoryRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_categories")
    .select("id, label, icon_name, sort_order, is_active")
    .order("sort_order", { ascending: true });

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    label: row.label as string,
    iconName: row.icon_name as string,
    sortOrder: row.sort_order as number,
    isActive: row.is_active as boolean,
  }));
}
