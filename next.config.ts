import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();

// Shared between images.remotePatterns and the CSP's img-src/connect-src —
// one derived value, not two literals that could drift apart.
const supabaseOrigin = supabaseHost ? `https://${supabaseHost}` : "";

// The two 'unsafe-inline's are a known, named compromise: react-easy-crop
// injects its own <style> tag (see CLAUDE.md's avatar-cropper bullet), and
// Tailwind's arbitrary values / Motion rely on inline styles too. A
// nonce-based strict CSP is a materially bigger change — see the 2026-07-28
// security-hardening spec §4 for the full reasoning. object-src is scoped to
// 'self' plus the app's own Supabase origin, not 'none': the transparency
// section's inline PDF preview (pdf-viewer.tsx) renders an <object> pointed
// at a Supabase Storage URL, which object-src governs directly — those files
// are always self-hosted, never an arbitrary third-party URL, so allowing
// just this one additional origin still blocks any attacker-controlled
// <object>/<embed>/<applet>. This still blocks exfiltration to an
// attacker-controlled connect-src.
//
// KNOWN GAP, verified 2026-07-28: this alone does not yet restore the PDF
// preview in Chrome. Chrome's native PDF viewer renders <object
// type="application/pdf"> content as an internal document/frame, so the
// browser also enforces frame-src (which falls back to default-src 'self'
// here, since frame-src is unset) against the Supabase origin — confirmed by
// injecting a cross-origin <object> in a live browser and seeing "Framing
// '<supabaseOrigin>' violates ... default-src 'self'" even though the
// object-src check passes. Fully unblocking the preview needs an explicit
// `frame-src 'self' ${supabaseOrigin}` line too; that's a separate directive
// decision, not made here.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  `object-src 'self' ${supabaseOrigin}`.trim(),
  `img-src 'self' data: https://lh3.googleusercontent.com ${supabaseOrigin}`.trim(),
  `connect-src 'self' ${supabaseOrigin}`.trim(),
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
].join("; ");

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Legislative/transparency PDFs are validated server-side against a
      // 10 MB cap (see MAX_PDF_BYTES in src/lib/storage.ts); the framework's
      // default 1 MB Server Action body limit would otherwise reject any
      // upload above 1 MB with an opaque framework error before that check
      // ever runs. Sized with headroom for multipart/form-data framing
      // overhead above the raw 10 MB file payload.
      //
      // TODO(security-hardening plan 3): this is global, so it also raises
      // the accepted body size on every public unauthenticated Server
      // Action. The PDF-upload Route Handler plan removes this line
      // entirely once uploads no longer flow through a Server Action body.
      bodySizeLimit: "12mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      ...(supabaseHost
        ? [{ protocol: "https" as const, hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
        : []),
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
