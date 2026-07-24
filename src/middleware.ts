import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  ACTIVITY_COOKIE,
  activityCookieOptions,
  hasActivityCookie,
} from "@/lib/session-activity";

/**
 * Next prefetches admin links on hover and on viewport entry. Those GETs must
 * not refresh the activity cookie: a page holding many links would keep its
 * own session alive with no human present.
 */
function isPrefetch(request: NextRequest): boolean {
  return (
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch"
  );
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the session cookie when expired — do not remove.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Exact match — assumes no nested routes exist under /admin/login.
  const isLoginPage = request.nextUrl.pathname === "/admin/login";
  const secure = request.nextUrl.protocol === "https:";

  if (!user && !isLoginPage) {
    const redirectResponse = NextResponse.redirect(
      new URL("/admin/login", request.url),
    );
    // Carry refreshed session cookies onto the redirect — getUser() may have rotated them.
    response.cookies
      .getAll()
      .forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  /*
   * The idle gate. A valid Supabase session with no activity cookie means the
   * user has been idle for 30 minutes, or the window was closed that long —
   * the browser expired the cookie on disk either way.
   *
   * The auth cookies are cleared here rather than by delegating to an
   * /admin/logout route handler: a GET that signs you out is CSRF-able, and an
   * <img src="/admin/logout"> on any page would sign an admin out. The cost is
   * that the refresh token is not revoked at Supabase, only deleted from the
   * browser — accepted, because the only copy is the one being deleted.
   *
   * No loop is possible. A signed-in user landing on /admin/login is bounced
   * to /admin below; that GET arrives here without a cookie, clears the
   * session, and returns to /admin/login — where `user` is now null and the
   * page simply renders.
   */
  if (
    user &&
    !isLoginPage &&
    !hasActivityCookie(request.cookies.get(ACTIVITY_COOKIE)?.value)
  ) {
    const timedOut = NextResponse.redirect(
      new URL("/admin/login?reason=timeout", request.url),
    );
    request.cookies
      .getAll()
      .filter((cookie) => cookie.name.startsWith("sb-"))
      .forEach((cookie) => timedOut.cookies.delete({ name: cookie.name, path: "/" }));
    timedOut.cookies.delete({ name: ACTIVITY_COOKIE, path: "/admin" });
    return timedOut;
  }

  if (user && isLoginPage) {
    const redirectResponse = NextResponse.redirect(
      new URL("/admin", request.url),
    );
    response.cookies
      .getAll()
      .forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  // A real page navigation by a signed-in user IS activity — slide the window.
  if (user && !isLoginPage && !isPrefetch(request)) {
    response.cookies.set(activityCookieOptions(secure));
  }

  return response;
}

export const config = {
  // Server Action POSTs (identified by the `Next-Action` header) are excluded:
  // Next.js buffers/clones the request body for any matched route
  // (`proxyClientMaxBodySize`, 10MB default) before it reaches the action's
  // own multipart parser, silently truncating large PDF uploads and causing
  // an unhandled "Unexpected end of form" crash instead of the app's own
  // 10MB validation message. Skipping middleware here is safe: every
  // transparency (and other admin) Server Action independently re-checks
  // auth via checkPermission()/checkSuperAdmin(), and — unlike Server
  // Components — cookies() is mutable inside a Server Action, so the
  // Supabase server client (src/lib/supabase/server.ts) refreshes the
  // session cookie itself when the action calls getUser(). Page navigations
  // (GET requests, no Next-Action header) still go through middleware and
  // get the redirect-to-login / redirect-to-/admin convenience.
  //
  // This is also why middleware cannot be the only idle gate: a user working
  // inside a drawer submits POSTs that never reach here. getSessionUser() in
  // src/lib/auth.ts is the second gate and covers them.
  matcher: [{ source: "/admin/:path*", missing: [{ type: "header", key: "next-action" }] }],
};
