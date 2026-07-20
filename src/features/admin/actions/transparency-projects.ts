"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ContentStatus, TransparencyProjectValues } from "@/types";
import { requirePermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ActionResult {
  error: string | null;
}
export interface SaveResult {
  error: string | null;
  id: string | null;
}

const schema = z.object({
  name: z.string().trim().min(3, "Enter a project name."),
  progress: z.number().int().min(0, "Progress must be 0–100.").max(100, "Progress must be 0–100."),
});

// Server Actions are public HTTP endpoints — `ContentStatus` only constrains
// callers that go through TypeScript. A direct POST can send any string, so
// validate at runtime before it reaches the update patch.
const statusSchema = z.enum(["draft", "in-review", "published", "archived"]);

// `/transparency` is a static route, so this revalidatePath call is the only
// mechanism keeping the public monitored-projects list fresh after an edit.
function revalidate() {
  revalidatePath("/admin/transparency");
  revalidatePath("/transparency");
}

export async function saveTransparencyProject(
  id: string | null,
  values: TransparencyProjectValues,
): Promise<SaveResult> {
  const actor = await requirePermission("manage-transparency");
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid values.", id: null };
  }

  const admin = createSupabaseAdminClient();

  if (id) {
    const { error } = await admin
      .from("transparency_projects")
      .update({
        name: parsed.data.name,
        progress: parsed.data.progress,
      })
      .eq("id", id);
    if (error) return { error: "Could not save the project.", id: null };

    await recordActivity(actor, "updated project", "transparency project", id, parsed.data.name);
    revalidate();
    return { error: null, id };
  }

  // New rows join at the end of the display list, mirroring createNewsCategory.
  const { data: rows, error: readError } = await admin
    .from("transparency_projects")
    .select("sort_order");
  if (readError) return { error: "Could not create the project. Try again.", id: null };
  const nextSortOrder =
    (rows ?? []).reduce((max, row) => Math.max(max, row.sort_order ?? 0), 0) + 1;

  const { data, error } = await admin
    .from("transparency_projects")
    .insert({
      name: parsed.data.name,
      progress: parsed.data.progress,
      sort_order: nextSortOrder,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not create the project.", id: null };

  await recordActivity(actor, "created project", "transparency project", data.id, parsed.data.name);
  revalidate();
  return { error: null, id: data.id };
}

/**
 * Move a project through draft → in-review → published → archived.
 * `published_at` is set once, on the first transition into published.
 */
export async function setTransparencyProjectStatus(
  id: string,
  status: ContentStatus,
): Promise<ActionResult> {
  const actor = await requirePermission("manage-transparency");

  const statusResult = statusSchema.safeParse(status);
  if (!statusResult.success) {
    return { error: statusResult.error.issues[0]?.message ?? "Invalid status." };
  }
  const nextStatus = statusResult.data;

  const admin = createSupabaseAdminClient();

  const { data: existing, error: readErr } = await admin
    .from("transparency_projects")
    .select("name, published_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !existing) return { error: "Project not found." };

  const patch: Record<string, unknown> = { status: nextStatus };
  if (nextStatus === "published" && !existing.published_at) {
    patch.published_at = new Date().toISOString();
  }

  const { error } = await admin.from("transparency_projects").update(patch).eq("id", id);
  if (error) return { error: "Could not update the project." };

  await recordActivity(
    actor,
    `${nextStatus} project`,
    "transparency project",
    id,
    existing.name as string,
  );
  revalidate();
  return { error: null };
}

/** Hard delete — for mistakes only. Archiving is the normal path for a finished project. */
export async function deleteTransparencyProject(id: string): Promise<ActionResult> {
  const actor = await requirePermission("manage-transparency");
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("transparency_projects")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin.from("transparency_projects").delete().eq("id", id);
  if (error) return { error: "Could not delete the project." };

  await recordActivity(
    actor,
    "deleted project",
    "transparency project",
    id,
    (existing?.name as string) ?? "",
  );
  revalidate();
  return { error: null };
}

/**
 * Swap a project's sort_order with its neighbour in the given direction. A
 * no-op at either end of the list is not an error.
 *
 * The two updates below are deliberately not wrapped in a transaction: this
 * is a short, hand-curated list edited by one admin at a time, and the worst
 * case of an interleaved swap is a duplicated sort_order, which
 * `order by sort_order` still renders deterministically enough to fix with
 * another click. That tradeoff was weighed and accepted rather than adding
 * an RPC for it. (Direct copy of moveNewsCategory in
 * src/features/admin/actions/news-categories.ts, table name changed.)
 */
export async function moveTransparencyProject(
  id: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const actor = await requirePermission("manage-transparency");
  const admin = createSupabaseAdminClient();
  const { data: rows, error: readError } = await admin
    .from("transparency_projects")
    .select("id, sort_order")
    .order("sort_order", { ascending: true });
  if (readError || !rows) return { error: "Could not reorder projects." };

  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) return { error: "Project not found." };

  const neighbourIndex = direction === "up" ? index - 1 : index + 1;
  if (neighbourIndex < 0 || neighbourIndex >= rows.length) {
    return { error: null };
  }

  const current = rows[index];
  const neighbour = rows[neighbourIndex];

  const { error: firstError } = await admin
    .from("transparency_projects")
    .update({ sort_order: neighbour.sort_order })
    .eq("id", current.id);
  if (firstError) return { error: "Could not reorder projects." };

  const { error: secondError } = await admin
    .from("transparency_projects")
    .update({ sort_order: current.sort_order })
    .eq("id", neighbour.id);
  if (secondError) return { error: "Could not reorder projects." };

  await recordActivity(actor, "reordered projects", "transparency project", id);
  revalidate();
  return { error: null };
}
