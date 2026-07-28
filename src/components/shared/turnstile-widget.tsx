"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef } from "react";

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
  "error-callback"?: () => void;
  size?: "normal" | "compact";
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
    return new Promise((resolve) => existing.addEventListener("load", () => resolve(), { once: true }));
  }
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), { once: true });
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
 */
export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ onVerify, className, size = "normal" }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const reactId = useId();
    const domId = `turnstile-${reactId.replace(/:/g, "")}`;

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
        console.warn("NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set — the CAPTCHA widget will not render.");
        return;
      }

      let cancelled = false;
      loadTurnstileScript().then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onVerify(token),
          "expired-callback": () => onVerify(null),
          "error-callback": () => onVerify(null),
          size,
        });
      });

      return () => {
        cancelled = true;
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
      };
      // Mount once per form instance; onVerify identity changes are handled
      // through the callback closure, not by re-rendering the widget.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <div ref={containerRef} id={domId} className={className} />;
  },
);
