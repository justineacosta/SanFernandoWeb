import Image from "next/image";
import { initialsOf } from "@/lib/initials";
import { AVATARS_MEDIA_BUCKET, mediaUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

/**
 * A staff member's photo, or their initials in the brand gradient.
 *
 * One component for all three call sites — the top bar, the Settings profile
 * card and the users table — which each carried their own copy of `initialsOf`
 * before this existed.
 *
 * `alt=""` is deliberate. Every call site renders the person's name adjacent to
 * the avatar, so announcing it again would be a duplicate; this is the same
 * decorative treatment the `aria-hidden` initials had.
 */

const SIZES = {
  sm: "h-9 w-9 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-24 w-24 text-2xl",
} as const;

/** Matches SIZES, for next/image's `sizes` hint. */
const PIXELS = { sm: 36, md: 48, lg: 96 } as const;

interface AvatarProps {
  /** `avatars-media` object path, or null for initials. */
  src: string | null;
  fullName: string;
  size?: keyof typeof SIZES;
  className?: string;
}

export function Avatar({ src, fullName, size = "sm", className }: AvatarProps) {
  if (src) {
    return (
      <span
        className={cn(
          "relative block shrink-0 overflow-hidden rounded-full bg-ink-100 ring-2 ring-brand-400/40",
          SIZES[size],
          className,
        )}
      >
        <Image
          src={mediaUrl(AVATARS_MEDIA_BUCKET, src)}
          alt=""
          fill
          sizes={`${PIXELS[size]}px`}
          className="object-cover"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand-400 to-brand-600 font-bold text-white",
        SIZES[size],
        className,
      )}
    >
      {initialsOf(fullName) || "?"}
    </span>
  );
}
