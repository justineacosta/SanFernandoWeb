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
// attacker-controlled connect-src. frame-src is scoped the same way and for
// the same reason: Chrome's native PDF viewer renders <object
// type="application/pdf"> content as an internal document/frame, which
// falls under frame-src (not object-src) — without it, Chrome's frame-src
// falls back to default-src 'self' and blocks the Supabase-hosted PDF from
// rendering even though object-src allows it. frame-ancestors below is the
// unrelated other half of framing (it governs other sites embedding this
// one, not this site embedding Supabase) and stays 'none'. img-src includes
// blob: because several upload previews (the feedback screenshot preview, the
// avatar cropper, the single-image and news-photo uploaders) render a
// client-side object URL before any network call happens; 'self' does not
// implicitly cover the blob: scheme. This doesn't meaningfully weaken the
// policy — a blob: URL can only be minted by script already running on the
// page, the same reasoning Next.js's own CSP docs use for this exact token.
// script-src, frame-src and connect-src all also allow
// https://challenges.cloudflare.com for the Turnstile CAPTCHA
// (security-hardening spec §5): it loads a script from that origin, renders
// its challenge in an iframe from that origin, and the widget makes its own
// XHR calls back to it. NewsletterForm (one of the 8 CAPTCHA'd forms) is
// mounted sitewide via SiteFooter, so this is exercised on every page, not
// just the forms that look CAPTCHA-specific.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `object-src 'self' ${supabaseOrigin}`.trim(),
  `frame-src 'self' ${supabaseOrigin} https://challenges.cloudflare.com`.trim(),
  `img-src 'self' blob: data: https://lh3.googleusercontent.com ${supabaseOrigin}`.trim(),
  `connect-src 'self' ${supabaseOrigin} https://challenges.cloudflare.com`.trim(),
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
].join("; ");

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Legislative/transparency PDFs no longer flow through a Server Action
      // body at all as of security-hardening Plan 3 — they go through
      // POST /api/admin/uploads/document instead, which has its own
      // Supabase-Storage-enforced ceiling (MAX_PDF_BYTES / MAX_DOC_FILE_BYTES
      // in src/lib/storage.ts) unrelated to this setting.
      //
      // This can't drop to Next's 1MB default, though: uploadSingleImage
      // (src/lib/media.ts, MAX_IMAGE_BYTES = 2MB) still runs *inside*
      // saveOfficial/saveEvent/saveAnnouncement/site-content Server Actions,
      // and both saveNewsArticle and uploadAchievementPhotos accept up to
      // MAX_PHOTOS = 3 images in a single Server Action call — up to 6MB.
      // 8mb gives that ~2MB of multipart/form-data framing headroom, the
      // same proportion the old 12mb gave a single 10MB PDF.
      bodySizeLimit: "8mb",
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
