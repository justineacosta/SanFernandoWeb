"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquarePlus, MessagesSquare } from "lucide-react";
import type { FeedbackRow, InquiryRow } from "@/types";
import { TabPills, type TabPill } from "@/components/ui/tab-pills";
import { AdminPageHeader } from "./admin-page-header";
import { FeedbackPanel } from "./feedback-panel";
import { InquiriesPanel } from "./inquiries-panel";

type Tab = "inquiries" | "feedback";

const TABS: TabPill<Tab>[] = [
  { value: "inquiries", label: "Inquiries", icon: MessagesSquare },
  { value: "feedback", label: "Feedback", icon: MessageSquarePlus },
];

interface InboxManagerProps {
  inquiries: InquiryRow[];
  feedback: FeedbackRow[];
  /**
   * Decides whether Delete is offered on a dismissed report. Presentation only —
   * `deleteFeedback` re-checks with `checkSuperAdmin()`.
   */
  isSuperAdmin: boolean;
}

/**
 * The two inbound queues on one page: messages residents sent through the
 * contact form, and anonymous feedback about the website.
 *
 * One page and one permission rather than two nav entries, because the same
 * people work both and a second permission would let an account see the page but
 * only half of it.
 *
 * The tab is read in the useState initialiser, not an effect: a search hit
 * arrives as ?tab=feedback&review=<id>, and the panel that owns the record has to
 * be the one that mounts, so that it — and only it — consumes `review`. Each
 * panel also takes an `active` flag for the same reason.
 */
export function InboxManager({ inquiries, feedback, isSuperAdmin }: InboxManagerProps) {
  const initialTab = useSearchParams().get("tab");
  const [tab, setTab] = useState<Tab>(initialTab === "feedback" ? "feedback" : "inquiries");

  return (
    <>
      <AdminPageHeader
        title="Inquiries & Feedback"
        description="Messages from the contact form, and feedback about this website."
      />
      <TabPills tabs={TABS} value={tab} onChange={setTab} label="Inbox queue" className="mb-6" />
      {tab === "inquiries" ? (
        <InquiriesPanel inquiries={inquiries} active />
      ) : (
        <FeedbackPanel records={feedback} isSuperAdmin={isSuperAdmin} active />
      )}
    </>
  );
}
