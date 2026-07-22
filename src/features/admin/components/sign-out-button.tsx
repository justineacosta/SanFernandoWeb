"use client";

import { LogOut } from "lucide-react";
import { signOut } from "@/features/admin/actions/auth";
import { clearAllDrafts } from "@/hooks/use-form-draft";

/**
 * Sign out, dropping every local recovery copy on the way.
 *
 * Draft keys are already scoped to the user id, so the next person to sign in
 * on this browser is never offered someone else's text. Clearing here is the
 * second layer: it means the copies do not sit in `localStorage` on a shared
 * barangay workstation after their author has left it.
 *
 * The click handler runs before the form submits, so the clear happens while
 * the page is still alive.
 */
export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        onClick={clearAllDrafts}
        aria-label="Sign out"
        className="rounded-full p-2 text-ink-600 transition-colors hover:bg-ink-50"
      >
        <LogOut className="h-5 w-5" aria-hidden="true" />
      </button>
    </form>
  );
}
