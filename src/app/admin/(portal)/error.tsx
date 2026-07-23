"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Portal counterpart of the public boundary. Staff get the digest prominently
 * — they are the ones who will report it — but still not `error.message`, which
 * can carry Postgres detail and would be the wrong thing to teach anyone to
 * paste into a chat.
 */
export default function AdminPortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-6 flex size-14 items-center justify-center rounded-full bg-danger-soft">
          <TriangleAlert className="size-7 text-danger" aria-hidden="true" />
        </span>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900">
          This page could not be loaded
        </h1>
        <p className="mt-3 text-ink-600">
          Nothing you were working on was saved by this attempt. Try again — if it keeps
          failing, send the reference code below to whoever maintains the site.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button variant="primary" onClick={reset}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Try again
          </Button>
          <Button variant="outline" href="/admin">
            Back to the portal
          </Button>
        </div>
        {error.digest ? (
          <p className="mt-6 text-xs text-ink-400">
            Reference code: <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}
      </div>
    </div>
  );
}
