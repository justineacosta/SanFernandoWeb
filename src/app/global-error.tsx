"use client";

import { useEffect } from "react";

/**
 * Last resort. A crash in the ROOT layout happens before any other boundary
 * exists, so this one must render its own <html> and <body> and cannot rely on
 * the app's fonts, tokens, or components — anything imported from the design
 * system might be the thing that just failed. Hence the inline styles.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          color: "#1c1917",
          background: "#fafaf9",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.75rem", margin: "0 0 0.75rem", fontWeight: 600 }}>
            Barangay San Fernando
          </h1>
          <p style={{ margin: "0 0 1.5rem", lineHeight: 1.6, color: "#57534e" }}>
            The site failed to load. Please try again in a moment, or call the barangay hall
            on (077) 600 1082 if you need help today.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "0.75rem 1.5rem",
              borderRadius: "9999px",
              border: "none",
              background: "#f59e0b",
              color: "#1c1917",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p style={{ marginTop: "1.5rem", fontSize: "0.75rem", color: "#a8a29e" }}>
              Reference code: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
