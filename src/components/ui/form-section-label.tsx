/**
 * Group label inside long forms (public ticket flows and admin drawers):
 * an editorial rule-and-label that chunks fields without changing them.
 */
export function FormSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 border-t border-ink-200/70 pt-6 text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">
      <span aria-hidden="true" className="h-px w-6 shrink-0 bg-brand-500" />
      {children}
    </p>
  );
}
