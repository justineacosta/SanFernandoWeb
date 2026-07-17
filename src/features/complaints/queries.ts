import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The catalog row representing the complaint flow. Complaints have no service
 * FK (spec §3 models them standalone), but this row's `is_available` toggle is
 * the barangay's only "we are not taking these online" switch, so the form
 * honours it exactly the way /services/apply/[slug] honours its own service.
 */
export const COMPLAINT_SERVICE_ID = "blotter-complaints";

/**
 * Cached per request: the page body and metadata both ask.
 * Fails CLOSED — if the row is missing or the read errors, the form is closed
 * rather than silently accepting reports the barangay did not advertise.
 */
export const isComplaintFlowAvailable = cache(async (): Promise<boolean> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("services")
    .select("is_available")
    .eq("id", COMPLAINT_SERVICE_ID)
    .maybeSingle();
  if (error) {
    console.error("isComplaintFlowAvailable failed:", error.message);
    return false;
  }
  return data?.is_available ?? false;
});
