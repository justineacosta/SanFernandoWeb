import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AdminPageHeader } from "@/features/admin/components/admin-page-header";

interface AdminPlaceholderProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

/** Stub body for admin sections awaiting their backend module. */
export function AdminPlaceholder({ icon: Icon, title, description }: AdminPlaceholderProps) {
  return (
    <>
      <AdminPageHeader title={title} description={description} />
      <Card className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-ink-300 bg-ink-50 p-16 text-center text-ink-500">
        <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-ink-900">
          <Icon className="h-8 w-8" aria-hidden="true" />
        </span>
        <h3 className="mb-2 text-xl font-semibold text-ink-900">Module in development</h3>
        <p className="max-w-md text-ink-600">
          This section will be activated together with its backend service. Content shown on the
          public portal is currently managed in code.
        </p>
      </Card>
    </>
  );
}
