interface AdminPageHeaderProps {
  title: string;
  description?: string;
  /** Action button(s) rendered on the right. */
  action?: React.ReactNode;
}

/** Standard admin page heading row with optional description and action. */
export function AdminPageHeader({ title, description, action }: AdminPageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <h2 className="mb-2 text-2xl font-bold text-ink md:text-4xl">{title}</h2>
        {description ? <p className="text-lg text-ink-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
