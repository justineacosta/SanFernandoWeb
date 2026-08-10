"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ServiceFlow, ServiceFormValues } from "@/types";
import { NOT_FOUND, checkSuperAdmin } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ICON_OPTIONS } from "@/lib/icon-map";

export interface ActionResult {
  error: string | null;
}

const serviceSchema = z.object({
  title: z.string().trim().min(2, "Title is too short."),
  description: z.string().trim().min(2, "Description is too short."),
  department: z.string().trim().min(2, "Department is required."),
  requirements: z.string(),
  status: z.enum(["active", "inactive"]),
  // Constrained to the known icon set — an unknown name would silently fall
  // back to a generic document icon on the public page.
  iconName: z
    .string()
    .refine((value) => ICON_OPTIONS.some((option) => option.value === value), "Pick a valid icon."),
  tone: z.enum(["primary", "danger"]),
  flow: z.enum(["apply", "complaint", "assistance", "appointment"]),
});

/**
 * The public card's two labels are derived, not stored edits — so they must be
 * derived from the same thing that decides where the CTA goes. Deriving from
 * `tone` (as this did before migration 0035) would reset the two request-flow
 * rows to "View Requirements"/"Apply Online" on the first SuperAdmin save,
 * days after anyone touched the seed data.
 *
 * These four pairs match 0035's seed values exactly, so saving an untouched
 * row is a no-op.
 */
function labelsForFlow(flow: ServiceFlow): { requirementsLabel: string; ctaLabel: string } {
  switch (flow) {
    case "complaint":
      return { requirementsLabel: "View Process", ctaLabel: "File Incident Report" };
    case "assistance":
      return { requirementsLabel: "What to prepare", ctaLabel: "Request Now" };
    case "appointment":
      return { requirementsLabel: "How it works", ctaLabel: "Book Now" };
    case "apply":
      return { requirementsLabel: "View Requirements", ctaLabel: "Apply Online" };
  }
}

/** URL/slug-safe id derived from the service title. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitRequirements(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Update a service's editable fields. */
export async function updateService(id: string, input: ServiceFormValues): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  const labels = labelsForFlow(parsed.data.flow);
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("services")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      department: parsed.data.department,
      requirements: splitRequirements(parsed.data.requirements),
      icon_name: parsed.data.iconName,
      tone: parsed.data.tone,
      flow: parsed.data.flow,
      requirements_label: labels.requirementsLabel,
      cta_label: labels.ctaLabel,
      is_available: parsed.data.status === "active",
    })
    .eq("id", id);
  if (error) return { error: "Could not save the service." };

  await recordActivity(actor, {
    type: "update",
    action: "updated service",
    entityType: "service",
    entityId: id,
    entityLabel: parsed.data.title,
  });
  revalidatePath("/admin/services");
  revalidatePath("/services");
  return { error: null };
}

/** Create a new service. The id/slug is derived from the title (de-duplicated). */
export async function createService(input: ServiceFormValues): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  const base = slugify(parsed.data.title);
  if (!base) return { error: "Enter a service name with letters or numbers." };

  const admin = createSupabaseAdminClient();

  // Derive a unique id from the title, appending -2, -3… on collision.
  const { data: rows, error: readError } = await admin.from("services").select("id, sort_order");
  if (readError) return { error: "Could not create the service. Try again." };
  const ids = new Set((rows ?? []).map((row) => row.id));
  let id = base;
  let suffix = 2;
  while (ids.has(id)) id = `${base}-${suffix++}`;

  const nextSortOrder =
    (rows ?? []).reduce((max, row) => Math.max(max, row.sort_order ?? 0), 0) + 1;
  const labels = labelsForFlow(parsed.data.flow);

  const { error } = await admin.from("services").insert({
    id,
    title: parsed.data.title,
    description: parsed.data.description,
    icon_name: parsed.data.iconName,
    tone: parsed.data.tone,
    flow: parsed.data.flow,
    requirements_label: labels.requirementsLabel,
    cta_label: labels.ctaLabel,
    requirements: splitRequirements(parsed.data.requirements),
    department: parsed.data.department,
    is_available: parsed.data.status === "active",
    sort_order: nextSortOrder,
  });
  if (error) return { error: "Could not create the service." };

  await recordActivity(actor, {
    type: "create",
    action: "created service",
    entityType: "service",
    entityId: id,
    entityLabel: parsed.data.title,
  });
  revalidatePath("/admin/services");
  revalidatePath("/services");
  return { error: null };
}

/** Toggle availability directly (the on/off switch), without opening the editor. */
export async function setServiceAvailable(id: string, isAvailable: boolean): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("services").update({ is_available: isAvailable }).eq("id", id);
  if (error) return { error: "Could not update availability." };

  await recordActivity(actor, {
    type: "update",
    action: isAvailable ? "enabled service" : "disabled service",
    entityType: "service",
    entityId: id,
  });
  revalidatePath("/admin/services");
  revalidatePath("/services");
  return { error: null };
}
