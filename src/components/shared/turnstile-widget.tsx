"use client";

import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: TurnstileRenderOptions) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback"?: () => void;
  /** Cloudflare passes its numeric error code as a string (e.g. "110200"). */
  "error-callback"?: (code?: string) => void;
  size?: "normal" | "compact";
  appearance?: "always" | "execute" | "interaction-only";
}

export interface TurnstileWidgetHandle {
  /** Cloudflare tokens are single-use; call after every submit attempt (success or failure). */
  reset: () => void;
}

interface TurnstileWidgetProps {
  onVerify: (token: string | null) => void;
  className?: string;
  size?: "normal" | "compact";
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.getElementById(SCRIPT_ID);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => {
          console.error("Turnstile script failed to load from", SCRIPT_SRC, "— the CAPTCHA widget will not render.");
          reject(new Error("Turnstile script failed to load"));
        },
        { once: true },
      );
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => {
        console.error("Turnstile script failed to load from", SCRIPT_SRC, "— the CAPTCHA widget will not render.");
        reject(new Error("Turnstile script failed to load"));
      },
      { once: true },
    );
    document.body.appendChild(script);
  });
}

/**
 * Cloudflare Turnstile widget, loaded as a plain script (no npm package —
 * matches the security-hardening spec's "wrapping Cloudflare's script"). If
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset (no Cloudflare account configured
 * yet), the widget renders nothing and warns once — the matching server-side
 * verifyTurnstileToken() bypass means the form still works end to end.
 *
 * Renders via the imperative window.turnstile API rather than the
 * data-attribute auto-render mode, because every one of the 8 forms needs to
 * reset() after a submit attempt (Cloudflare tokens are single-use) without
 * remounting the surrounding form and losing its state.
 *
 * appearance: "interaction-only" keeps the widget's box invisible (zero
 * footprint, no "Success!" badge) for the common case where Cloudflare
 * clears the visitor non-interactively — which is nearly always, since this
 * is a Managed-mode site key. It only pops into view on the rare visitor
 * Cloudflare actually wants to challenge. Deliberately not "execute": that
 * mode defers running the check until a manual turnstile.execute() call,
 * which would mean the token isn't ready until well after mount — every one
 * of the 8 forms already assumes a token may be sitting in state before
 * submit.
 */
export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ onVerify, className, size = "normal" }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const reactId = useId();
    const domId = `turnstile-${reactId.replace(/:/g, "")}`;

    // A failed challenge is invisible by construction: `interaction-only`
    // keeps the box zero-height, so a widget that errored and one that cleared
    // silently look identical. Without this flag the resident's only feedback
    // is the server's TURNSTILE_FAILURE_MESSAGE — "complete the challenge and
    // try again" — naming a challenge that is not on the page and never will
    // be, which makes the form permanently unsubmittable with no way out.
    const [unavailable, setUnavailable] = useState(false);
    // Bumped by "Try again". The mount effect keys on it, so a retry re-runs
    // the whole routine — script load included, which `window.turnstile.reset`
    // cannot do when the script is what failed.
    const [attempt, setAttempt] = useState(0);

    useImperativeHandle(ref, () => ({
      reset() {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        }
      },
    }));

    useEffect(() => {
      const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
      if (!siteKey) {
        // Development only — the matching server-side bypass in
        // verifyTurnstileToken() keeps the form working, so there is nothing
        // to tell the resident about. In production the missing key throws
        // server-side instead of reaching here.
        console.warn("NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set — the CAPTCHA widget will not render.");
        return;
      }

      let cancelled = false;
      loadTurnstileScript()
        .then(() => {
          if (cancelled || !containerRef.current || !window.turnstile) return;
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            callback: (token) => {
              // Cloudflare retries most errors on its own (retry: "auto"), so
              // a later success has to clear a banner an earlier attempt
              // raised — otherwise a self-healed widget keeps accusing itself.
              if (!cancelled) setUnavailable(false);
              onVerify(token);
            },
            // An expired token is the widget working correctly, not failing:
            // it refreshes itself, so clear the token without alarming anyone.
            "expired-callback": () => onVerify(null),
            "error-callback": (code) => {
              console.error(
                `Turnstile could not verify this visitor (error ${code ?? "unknown"}).`,
                "110200 means this hostname is not on the site key's allow-list.",
              );
              if (!cancelled) setUnavailable(true);
              onVerify(null);
            },
            size,
            appearance: "interaction-only",
          });
        })
        .catch(() => {
          // Already console.error'd inside loadTurnstileScript. The rejection
          // is handled here rather than swallowed, so a blocked script surfaces
          // to the resident the same way a rejected site key does.
          if (!cancelled) setUnavailable(true);
        });

      return () => {
        cancelled = true;
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
      };
      // Re-runs only on an explicit retry; onVerify identity changes are
      // handled through the callback closure, not by re-rendering the widget.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt]);

    const retry = useCallback(() => {
      setUnavailable(false);
      setAttempt((n) => n + 1);
    }, []);

    return (
      <div className={className}>
        <div ref={containerRef} id={domId} />
        {unavailable ? (
          // Self-contained tone rather than inherited text colour: this renders
          // inside the dark newsletter card as well as the light forms, and
          // `InlineAlert`'s bare `text-danger` is unreadable on the former.
          <div
            role="alert"
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-danger/20",
              "bg-danger-soft px-4 py-3 text-sm font-medium text-danger-soft-fg",
            )}
          >
            <span className="flex-1">
              Security check could not load. An ad blocker or your connection may be blocking it.
            </span>
            <button
              type="button"
              onClick={retry}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-danger-soft-fg px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : null}
      </div>
    );
  },
);
