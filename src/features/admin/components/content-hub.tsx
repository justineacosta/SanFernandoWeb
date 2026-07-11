import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { ContentTypeCard } from "@/features/admin/components/content-type-card";
import { PublishingActivity } from "@/features/admin/components/publishing-activity";
import { RecentDrafts } from "@/features/admin/components/recent-drafts";
import { CONTENT_TYPE_ACTIONS } from "@/features/admin/data";

/** "Create New Content" hub: quick actions, recent drafts, and publishing log. */
export function ContentHub() {
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
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        {CONTENT_TYPE_ACTIONS.map((action) => (
          <ContentTypeCard key={action.title} action={action} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecentDrafts />
        <PublishingActivity />
      </div>
    </>
  );
}
