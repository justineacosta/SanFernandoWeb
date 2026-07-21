import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { ContentTypeCard } from "@/features/admin/components/content-type-card";
import { AuditLogPanel } from "@/features/admin/components/audit-log-panel";
import { RecentDrafts } from "@/features/admin/components/recent-drafts";
import { CONTENT_TYPE_ACTIONS } from "@/features/admin/data";
import { requireSessionUser } from "@/lib/auth";
import type { AuditEntry } from "@/types";

interface ContentHubProps {
  activityEntries: AuditEntry[];
}

/**
 * "Create New Content" hub: quick actions, recent drafts, and publishing log.
 *
 * The cards are permission-filtered with the same predicate AdminSidebar uses.
 * Every card links to a gated module, and those now 404 rather than redirect,
 * so showing an unreachable card would both dead-end the user and reveal that
 * the module exists.
 */
export async function ContentHub({ activityEntries }: ContentHubProps) {
  const user = await requireSessionUser();
  const cards = CONTENT_TYPE_ACTIONS.filter(
    (action) =>
      !action.permission || user.isSuperAdmin || user.permissions.includes(action.permission),
  );

  return (
    <>
      <AdminPageHeader
        title="Create New Content"
        description="Select a content type to start drafting for the public portal."
        action={
          <Button size="lg" className="normal-case tracking-normal">
            <Plus className="h-5 w-5" aria-hidden="true" />
            Quick Draft
          </Button>
        }
      />
      {cards.length > 0 ? (
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          {cards.map((action) => (
            <ContentTypeCard key={action.title} action={action} />
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecentDrafts />
        <AuditLogPanel entries={activityEntries} canViewAll={user.isSuperAdmin} />
      </div>
    </>
  );
}
