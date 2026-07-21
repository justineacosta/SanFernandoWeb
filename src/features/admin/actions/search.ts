"use server";

import { z } from "zod";
import { checkPermission, checkSuperAdmin, getSessionUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  MIN_QUERY_LENGTH,
  MODULE_PERMISSION,
  SEARCH_MODULES,
  type GlobalSearchResult,
  type SearchModule,
} from "@/features/admin/search-modules";

const querySchema = z.string().max(200);

/**
 * Cross-module admin search, scoped to the viewer's permissions.
 *
 * The allow-list is built here from checkPermission() and passed into the RPC,
 * so the database never scans a module the viewer cannot open. Nothing the
 * client sends influences which modules are searched — a Server Action is a
 * public HTTP endpoint, so the query string is the only value trusted from the
 * caller, and even that is length-capped and validated.
 *
 * Returns empty rather than an error shape when signed out: this powers a
 * type-ahead, and the viewer's next navigation hits requireSessionUser() and
 * lands on the login page anyway.
 */
export async function globalSearch(rawQuery: string): Promise<GlobalSearchResult> {
  const user = await getSessionUser();
  if (!user) return { hits: [], tooShort: false };

  const parsed = querySchema.safeParse(rawQuery);
  if (!parsed.success) return { hits: [], tooShort: false };
  const q = parsed.data.trim();
  if (q.length < MIN_QUERY_LENGTH) return { hits: [], tooShort: true };

  const allowed: SearchModule[] = [];
  for (const name of SEARCH_MODULES) {
    const permission = MODULE_PERMISSION[name];
    const granted =
      permission === null ? await checkSuperAdmin() : await checkPermission(permission);
    if (granted) allowed.push(name);
  }
  if (allowed.length === 0) return { hits: [], tooShort: false };

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("search_admin_global", {
    p_q: q,
    p_modules: allowed,
    p_limit: 5,
  });
  if (error || !data) {
    if (error) console.error("globalSearch failed:", error.message);
    return { hits: [], tooShort: false };
  }

  const rows = data as {
    module: SearchModule;
    record_id: string;
    label: string;
    sublabel: string;
    status: string;
  }[];

  // Re-sort into SEARCH_MODULES order: UNION ALL does not guarantee branch
  // order, and the grouped list should read the same way every time.
  const rank = new Map(SEARCH_MODULES.map((name, index) => [name, index]));
  return {
    hits: rows
      .map((row) => ({
        module: row.module,
        id: row.record_id,
        label: row.label,
        sublabel: row.sublabel,
        status: row.status,
      }))
      .sort((a, b) => (rank.get(a.module) ?? 99) - (rank.get(b.module) ?? 99)),
    tooShort: false,
  };
}
