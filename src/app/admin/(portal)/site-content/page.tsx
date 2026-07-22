import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { SiteContentManager } from "@/features/admin";
import {
  listAdminSiteBlocks,
  listAdminSiteItems,
} from "@/features/admin/queries/site-content";

export const metadata: Metadata = { title: "Site Content" };

export default async function AdminSiteContentPage() {
  await requirePermission("manage-site-content");
  const [items, blocks] = await Promise.all([listAdminSiteItems(), listAdminSiteBlocks()]);
  return <SiteContentManager items={items} blocks={blocks} />;
}
