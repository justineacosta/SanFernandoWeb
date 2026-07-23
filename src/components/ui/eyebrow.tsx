import { cn } from "@/lib/utils";

const tones = {
  light: "text-ink-500 before:bg-brand-500",
  dark: "text-ink-400 before:bg-brand-400",
} as const;

/**
 * Editorial section label (overhaul spec §2): a short amber rule +
 * letterspaced uppercase text. Replaces the pill Badge as the eyebrow
 * treatment; Badge remains for genuine statuses.
 */
export function Eyebrow({
  children,
  tone = "light",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em]",
        "before:h-px before:w-6 before:shrink-0 before:content-['']",
        tones[tone],
        className,
      )}
    >
      {children}
    </p>
  );
}
