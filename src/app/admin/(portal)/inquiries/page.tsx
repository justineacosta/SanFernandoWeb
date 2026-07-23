import { checkSuperAdmin, gatedMetadata, requirePermission } from "@/lib/auth";
import { InboxManager } from "@/features/admin";
import { listFeedback } from "@/features/admin/queries/feedback";
import { listInquiries } from "@/features/admin/queries/inquiries";

export const generateMetadata = gatedMetadata("handle-inquiries", "Inquiries & Feedback");

/**
 * The route stays `/admin/inquiries` even though it now holds two queues:
 * renaming it would break existing bookmarks and every `revalidatePath` call for
 * no gain.
 */
export default async function AdminInquiriesPage() {
  await requirePermission("handle-inquiries");
  const [inquiries, feedback, actor] = await Promise.all([
    listInquiries(),
    listFeedback(),
    checkSuperAdmin(),
  ]);
  return <InboxManager inquiries={inquiries} feedback={feedback} isSuperAdmin={actor !== null} />;
}
