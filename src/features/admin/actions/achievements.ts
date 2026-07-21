"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AchievementValues } from "@/types";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PUBLIC_MEDIA_BUCKET } from "@/lib/storage";

export interface ActionResult {
  error: string | null;
}
export interface CreateResult {
  error: string | null;
  id: string | null;
}

/** A profile page is a summary, not a CV. */
const MAX_ACHIEVEMENTS = 20;

const valuesSchema = z.object({
  title: z.string().trim().max(160, "Keep the title under 160 characters."),
  description: z.string().max(2000, "Keep the description under 2000 characters."),
  dateLabel: z.string().trim().max(60, "Keep the date short, like “March 2024”."),
});

// `z.uuid()` is the zod v4 top-level form; the v3 `z.string().uuid()` spelling
// is deprecated in v4.
const idSchema = z.uuid();
const reorderSchema = z.array(z.uuid()).min(1).max(MAX_ACHIEVEMENTS);

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Achievements render only on the official's own profile page, so the
 * directory (/officials) and the About captain block need no revalidation.
 */
async function revalidateForOfficial(admin: Admin, officialId: string) {
  revalidatePath("/admin/officials");
  const { data } = await admin
    .from("officials")
    .select("slug")
    .eq("id", officialId)
    .maybeSingle();
  if (data?.slug) revalidatePath(`/officials/${data.slug as string}`);
}

/** Resolve the owning official — needed for both revalidation and audit. */
async function officialIdFor(admin: Admin, achievementId: string): Promise<string | null> {
  const { data } = await admin
    .from("official_achievements")
    .select("official_id")
    .eq("id", achievementId)
    .maybeSingle();
  return (data?.official_id as string) ?? null;
}

/**
 * Insert an empty achievement at the end of the list. The row exists before
 * the staff member types anything because its photos need a stable id to
 * upload against; a blank title is filtered out of the public query, so an
 * unfinished entry cannot reach the site.
 */
export async function createAchievement(officialId: string): Promise<CreateResult> {
  const actor = await checkPermission("manage-officials");
  if (!actor) return { error: NOT_FOUND, id: null };
  if (!idSchema.safeParse(officialId).success) {
    return { error: "Invalid official.", id: null };
  }

  const admin = createSupabaseAdminClient();
  const { data: existing, error: countErr } = await admin
    .from("official_achievements")
    .select("sort_order")
    .eq("official_id", officialId)
    .order("sort_order", { ascending: false });
  if (countErr) return { error: "Could not add the achievement.", id: null };

  const rows = existing ?? [];
  if (rows.length >= MAX_ACHIEVEMENTS) {
    return { error: `An official can have at most ${MAX_ACHIEVEMENTS} achievements.`, id: null };
  }
  const nextOrder = ((rows[0]?.sort_order as number) ?? -1) + 1;

  const { data, error } = await admin
    .from("official_achievements")
    .insert({ official_id: officialId, sort_order: nextOrder })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not add the achievement.", id: null };

  await recordActivity(actor, "added achievement", "official", officialId);
  await revalidateForOfficial(admin, officialId);
  return { error: null, id: data.id as string };
}

export async function updateAchievement(
  id: string,
  values: AchievementValues,
): Promise<ActionResult> {
  const actor = await checkPermission("manage-officials");
  if (!actor) return { error: NOT_FOUND };
  if (!idSchema.safeParse(id).success) return { error: "Invalid achievement." };

  const parsed = valuesSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid values." };
  }

  const admin = createSupabaseAdminClient();
  const officialId = await officialIdFor(admin, id);
  if (!officialId) return { error: "Achievement not found." };

  const { error } = await admin
    .from("official_achievements")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      date_label: parsed.data.dateLabel,
    })
    .eq("id", id);
  if (error) return { error: "Could not save the achievement." };

  await recordActivity(actor, "updated achievement", "official", officialId, parsed.data.title);
  await revalidateForOfficial(admin, officialId);
  return { error: null };
}

export async function setAchievementVisibility(
  id: string,
  isVisible: boolean,
): Promise<ActionResult> {
  const actor = await checkPermission("manage-officials");
  if (!actor) return { error: NOT_FOUND };
  if (!idSchema.safeParse(id).success) return { error: "Invalid achievement." };
  if (typeof isVisible !== "boolean") return { error: "Invalid value." };

  const admin = createSupabaseAdminClient();
  const officialId = await officialIdFor(admin, id);
  if (!officialId) return { error: "Achievement not found." };

  const { error } = await admin
    .from("official_achievements")
    .update({ is_visible: isVisible })
    .eq("id", id);
  if (error) return { error: "Could not update the achievement." };

  await recordActivity(
    actor,
    isVisible ? "showed achievement" : "hid achievement",
    "official",
    officialId,
  );
  await revalidateForOfficial(admin, officialId);
  return { error: null };
}

/**
 * Rewrite positions from an ordered id list. Every update is scoped to the
 * owning official, so a forged id belonging to someone else is a no-op rather
 * than a cross-record write.
 */
export async function reorderAchievements(
  officialId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const actor = await checkPermission("manage-officials");
  if (!actor) return { error: NOT_FOUND };
  if (!idSchema.safeParse(officialId).success) return { error: "Invalid official." };
  if (!reorderSchema.safeParse(orderedIds).success) return { error: "Invalid ordering." };

  const admin = createSupabaseAdminClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin
      .from("official_achievements")
      .update({ sort_order: i })
      .eq("id", orderedIds[i])
      .eq("official_id", officialId);
    if (error) return { error: "Could not save the new order." };
  }

  await recordActivity(actor, "reordered achievements", "official", officialId);
  await revalidateForOfficial(admin, officialId);
  return { error: null };
}

/**
 * Delete an achievement and its photos. The DB cascade removes the photo
 * ROWS; Storage objects are invisible to Postgres and must be swept here.
 */
export async function deleteAchievement(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-officials");
  if (!actor) return { error: NOT_FOUND };
  if (!idSchema.safeParse(id).success) return { error: "Invalid achievement." };

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("official_achievements")
    .select("official_id, title")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { error: null }; // already gone

  const { data: photos } = await admin
    .from("official_achievement_photos")
    .select("src")
    .eq("achievement_id", id);
  // Only remove objects we own — a value that is already a remote URL was
  // never uploaded here and must be left alone.
  const paths = (photos ?? [])
    .map((photo) => photo.src as string)
    .filter((src) => !/^https?:\/\//i.test(src));
  if (paths.length > 0) {
    const { error: removeErr } = await admin.storage.from(PUBLIC_MEDIA_BUCKET).remove(paths);
    if (removeErr) {
      // A failed cleanup must not fail the delete the user just made, but the
      // orphans it leaves are invisible otherwise — log the paths for a human.
      console.error(`Orphaned storage objects (achievement cleanup failed): ${paths.join(", ")}`);
    }
  }

  const { error } = await admin.from("official_achievements").delete().eq("id", id);
  if (error) return { error: "Could not delete the achievement." };

  const officialId = existing.official_id as string;
  await recordActivity(
    actor,
    "deleted achievement",
    "official",
    officialId,
    (existing.title as string) ?? "",
  );
  await revalidateForOfficial(admin, officialId);
  return { error: null };
}
