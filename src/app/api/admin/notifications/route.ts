import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getNotificationSnapshot } from "@/features/admin/queries/notifications";

/**
 * Polled every 60s by NotificationProvider. Sits under `/api/`, outside
 * `src/proxy.ts`'s matcher (`/admin/:path*`), so it re-checks the
 * session itself — including the idle timeout, since `getSessionUser` is the
 * second of the project's two idle gates and Proxy only covers page
 * GETs.
 *
 * 401 with no body on no session. The provider treats 401 as "stop polling,
 * silently" — `<IdleTimeout />` owns the warning dialog and the sign-out
 * redirect, and a second component reacting to the same condition here would
 * race it.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const snapshot = await getNotificationSnapshot(user);
  return NextResponse.json(snapshot);
}
