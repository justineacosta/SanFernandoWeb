"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ServiceFormValues } from "@/types";
import { requireSuperAdmin } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ActionResult {
  error: string | null;
}

const serviceSchema = z.object({
  title: z.string().trim().min(2, "Title is too short."),
  description: z.string().trim().min(2, "Description is too short."),
  department: z.string().trim().min(2, "Department is required."),
  requirements: z.string(),
  status: z.enum(["active", "inactive"]),
});

/** Update a service's editable fields (title/description/department/requirements/availability). */
export async function updateService(id: string, input: ServiceFormValues): Promise<ActionResult> {
  const actor = await requireSuperAdmin();
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  const requirements = parsed.data.requirements
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("services")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      department: parsed.data.department,
      requirements,
      is_available: parsed.data.status === "active",
    })
    .eq("id", id);
  if (error) return { error: "Could not save the service." };

  await recordActivity(actor, "updated service", "service", id, parsed.data.title);
  revalidatePath("/admin/services");
  revalidatePath("/services");
  return { error: null };
}

/** Toggle availability directly (the on/off switch), without opening the editor. */
export async function setServiceAvailable(id: string, isAvailable: boolean): Promise<ActionResult> {
  const actor = await requireSuperAdmin();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("services").update({ is_available: isAvailable }).eq("id", id);
  if (error) return { error: "Could not update availability." };

  await recordActivity(actor, isAvailable ? "enabled service" : "disabled service", "service", id);
  revalidatePath("/admin/services");
  revalidatePath("/services");
  return { error: null };
}
