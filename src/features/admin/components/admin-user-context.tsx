"use client";

import { createContext, useContext } from "react";

/**
 * The signed-in admin's id, for client components that need to scope
 * browser-local state to a person rather than to a device.
 *
 * Only the id, deliberately. Names, permissions and the superadmin flag are
 * already passed as props where they are needed, and a context holding the
 * whole session user would invite reading authorization out of it — which is
 * a server-side decision (`src/lib/auth.ts`), never a client one.
 */
const AdminUserIdContext = createContext<string | null>(null);

export function AdminUserProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  return <AdminUserIdContext.Provider value={userId}>{children}</AdminUserIdContext.Provider>;
}

/** Null when rendered outside the portal, which disables local recovery copies. */
export function useAdminUserId(): string | null {
  return useContext(AdminUserIdContext);
}
