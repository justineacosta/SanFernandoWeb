"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuthFormState {
  error: string | null;
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return { error: "Incorrect email or password." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active, is_archived")
    .eq("id", data.user.id)
    .single();
  if (!profile || !profile.is_active || profile.is_archived) {
    await supabase.auth.signOut();
    return { error: "This account is disabled. Contact the barangay administrator." };
  }

  redirect("/admin");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
