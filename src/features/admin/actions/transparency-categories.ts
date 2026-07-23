"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { TransparencyCategoryValues } from "@/types";
import { NOT_FOUND, checkSuperAdmin } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ActionResult {
  error: string | null;
}

const categorySchema = z.object({
  label: z
    .string()
    .trim()
    .min(3, "Enter a category name.")
    .max(60, "Please keep the category name short."),
  iconName: z.string().trim().min(1, "Pick an icon."),
});

/** URL/slug-safe id derived from the category label. Mirrors services.ts's slugify. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function revalidate() {
  revalidatePath("/admin/transparency");
  revalidatePath("/transparency");
}

/**
 * Create a new transparency category. Unlike services (which auto-suffix a
 * colliding slug with -2, -3…), categories reject on collision: the id is a
 * stable foreign key for transparency_documents.category_id, and silently
 * minting `financials-2` next to `financials` would be confusing rather than
 * helpful for this short, hand-curated list.
 */
export async function createTransparencyCategory(
  values: TransparencyCategoryValues,
): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };
  const parsed = categorySchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  const id = slugify(parsed.data.label);
  if (!id) return { error: "Enter a category name with letters or numbers." };

  const admin = createSupabaseAdminClient();
  const { data: rows, error: readError } = await admin
    .from("transparency_categories")
    .select("id, sort_order");
  if (readError) return { error: "Could not create the category. Try again." };

  if ((rows ?? []).some((row) => row.id === id)) {
    return { error: "A category with that name already exists." };
  }

  const nextSortOrder =
    (rows ?? []).reduce((max, row) => Math.max(max, row.sort_order ?? 0), 0) + 1;

  const { error } = await admin.from("transparency_categories").insert({
    id,
    label: parsed.data.label,
    icon_name: parsed.data.iconName,
    sort_order: nextSortOrder,
  });
  if (error) return { error: "Could not create the category." };

  await recordActivity(actor, {
    type: "create",
    action: "added transparency category",
    entityType: "transparency category",
    entityId: id,
    entityLabel: parsed.data.label,
  });
  revalidate();
  return { error: null };
}

/** Rename a category's label and icon. The id (and existing documents' category_id) never changes. */
export async function renameTransparencyCategory(
  id: string,
  values: TransparencyCategoryValues,
): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };
  const parsed = categorySchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("transparency_categories")
    .update({ label: parsed.data.label, icon_name: parsed.data.iconName })
    .eq("id", id);
  if (error) return { error: "Could not rename the category." };

  await recordActivity(actor, {
    type: "update",
    action: "renamed transparency category",
    entityType: "transparency category",
    entityId: id,
    entityLabel: parsed.data.label,
  });
  revalidate();
  return { error: null };
}

/**
 * Retire or restore a category. There is deliberately no delete action:
 * transparency_documents.category_id references these rows, and a hard
 * delete would orphan a published document.
 */
export async function setTransparencyCategoryActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("transparency_categories")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { error: "Could not update the category." };

  await recordActivity(actor, {
    type: isActive ? "restore" : "archive",
    action: isActive ? "restored transparency category" : "retired transparency category",
    entityType: "transparency category",
    entityId: id,
  });
  revalidate();
  return { error: null };
}

/**
 * Swap a category's sort_order with its neighbour in the given direction. A
 * no-op at either end of the list is not an error.
 *
 * The two updates below are deliberately not wrapped in a transaction: this
 * is a 4-item display list edited by one SuperAdmin at a time, and the worst
 * case of an interleaved swap is a duplicated sort_order, which
 * `order by sort_order` still renders deterministically enough to fix with
 * another click. That tradeoff was weighed and accepted rather than adding
 * an RPC for it.
 */
export async function moveTransparencyCategory(
  id: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };
  const admin = createSupabaseAdminClient();
  const { data: rows, error: readError } = await admin
    .from("transparency_categories")
    .select("id, sort_order")
    .order("sort_order", { ascending: true });
  if (readError || !rows) return { error: "Could not reorder categories." };

  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) return { error: "Category not found." };

  const neighbourIndex = direction === "up" ? index - 1 : index + 1;
  if (neighbourIndex < 0 || neighbourIndex >= rows.length) {
    return { error: null };
  }

  const current = rows[index];
  const neighbour = rows[neighbourIndex];

  const { error: firstError } = await admin
    .from("transparency_categories")
    .update({ sort_order: neighbour.sort_order })
    .eq("id", current.id);
  if (firstError) return { error: "Could not reorder categories." };

  const { error: secondError } = await admin
    .from("transparency_categories")
    .update({ sort_order: current.sort_order })
    .eq("id", neighbour.id);
  if (secondError) return { error: "Could not reorder categories." };

  await recordActivity(actor, {
    type: "reorder",
    action: "reordered transparency categories",
    entityType: "transparency category",
    entityId: id,
  });
  revalidate();
  return { error: null };
}
