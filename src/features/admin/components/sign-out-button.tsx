"use client";

import type { ReactNode } from "react";
import { signOut } from "@/features/admin/actions/auth";
import { clearAllDrafts } from "@/hooks/use-form-draft";

interface SignOutButtonProps {
  className: string;
  children: ReactNode;
}

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
 *
 * Rendered from the desktop sidebar's footer and the mobile menu card's
 * footer — two different row shapes on two different backgrounds — so this
 * component owns only the shared behavior (the form action, the draft clear)
 * and takes its entire visual presentation from the caller.
 */
export function SignOutButton({ className, children }: SignOutButtonProps) {
  return (
    <form action={signOut}>
      <button type="submit" onClick={clearAllDrafts} aria-label="Sign out" className={className}>
        {children}
      </button>
    </form>
  );
}
