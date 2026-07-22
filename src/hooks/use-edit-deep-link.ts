"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Open a manager's editor for the record named in `?edit=<id>` (or `?review=`),
 * then strip the parameter.
 *
 * This is what makes a global-search result useful: before it, a hit dropped
 * you on the module's index page and left you to find the row yourself. Drawer
 * editors are client state with no URL of their own, so the query parameter is
 * the only handle a link can take hold of.
 *
 * The parameter is removed with `router.replace` once acted on, so a refresh or
 * a back-navigation does not re-open the drawer over whatever the user moved on
 * to. `handled` guards the same id being acted on twice before the URL settles.
 *
 * No permission check here: the page itself is gated by `requirePermission`,
 * and the search cannot hand out an id for a module the viewer cannot open.
 */
export function useEditDeepLink(
  param: "edit" | "review",
  open: (id: string) => void,
  /**
   * False leaves the parameter alone. Tabbed pages use this so only the panel
   * that owns the record consumes the link — otherwise whichever component
   * rendered first would strip the parameter and the right one would never
   * see it.
   */
  enabled = true,
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const id = searchParams.get(param);
  const handled = useRef<string | null>(null);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
  });

  useEffect(() => {
    if (!enabled || !id || handled.current === id) return;
    handled.current = id;
    openRef.current(id);
    router.replace(pathname, { scroll: false });
  }, [enabled, id, pathname, router]);
}
