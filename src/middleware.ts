import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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
  if (user && isLoginPage) {
    const redirectResponse = NextResponse.redirect(
      new URL("/admin", request.url),
    );
    response.cookies
      .getAll()
      .forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
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
  matcher: [{ source: "/admin/:path*", missing: [{ type: "header", key: "next-action" }] }],
};
