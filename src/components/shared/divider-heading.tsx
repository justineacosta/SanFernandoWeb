interface DividerHeadingProps {
  children: React.ReactNode;
}

/** Centered heading flanked by horizontal rules, used to segment directories. */
export function DividerHeading({ children }: DividerHeadingProps) {
  return (
    <div className="mb-8 flex items-center gap-4">
      <div className="h-px flex-grow bg-ink-200" aria-hidden="true" />
      <h2 className="text-xl font-semibold text-ink-900 md:text-2xl">{children}</h2>
      <div className="h-px flex-grow bg-ink-200" aria-hidden="true" />
    </div>
  );
}
