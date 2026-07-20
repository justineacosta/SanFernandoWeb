import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Legislative/transparency PDFs are validated server-side against a
      // 10 MB cap (see MAX_PDF_BYTES in src/lib/storage.ts); the framework's
      // default 1 MB Server Action body limit would otherwise reject any
      // upload above 1 MB with an opaque framework error before that check
      // ever runs. Sized with headroom for multipart/form-data framing
      // overhead above the raw 10 MB file payload.
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
};

export default nextConfig;
