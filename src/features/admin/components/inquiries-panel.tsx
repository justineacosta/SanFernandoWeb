"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Inbox, MailOpen, MessagesSquare, XCircle } from "lucide-react";
import type { InquiryRow, InquiryStatus, InquiryUpdateValues } from "@/types";
import { Card, CardHeader } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { RowActions } from "@/components/ui/row-actions";
import { SortableTh } from "@/components/ui/sortable-th";
import { Toast } from "@/components/ui/toast";
import { useTableSort } from "@/components/ui/use-table-sort";
import { useEditDeepLink } from "@/hooks/use-edit-deep-link";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { fuzzyFilter, haystack } from "@/lib/fuzzy";
import { updateInquiry } from "@/features/admin/actions/inquiries";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPagination } from "./admin-pagination";
import { AdminStatCard } from "./admin-stat-card";
import { InquiryDrawer, INQUIRY_STATUS_OPTIONS } from "./inquiry-drawer";
import { StatusChip } from "./status-chip";

const PAGE_SIZE = 8;

interface InquiriesPanelProps {
  inquiries: InquiryRow[];
  /** False while the other tab is showing: only the visible panel consumes ?review=. */
  active: boolean;
}

/**
 * The contact-form inbox, as one tab of the Inquiries & Feedback page.
 *
 * Not a ticket queue: an inquiry has no number, nothing for a resident to
 * track, and no walk-in counterpart to encode — so there is no "New" button and
 * no receipt. Every row arrived from /contact.
 */
export function InquiriesPanel({ inquiries, active }: InquiriesPanelProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { toast, showToast, showError, dismissToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const newCount = inquiries.filter((record) => record.status === "new").length;
  const inProgressCount = inquiries.filter((record) => record.status === "in_progress").length;

  const filtered = useMemo(() => {
    const narrowed = inquiries.filter((record) => status === "all" || record.status === status);
    return fuzzyFilter(narrowed, search, (record) =>
      haystack(
        record.firstName,
        record.lastName,
        record.email,
        record.phone,
        record.subjectLabel,
        record.message,
      ),
    );
  }, [inquiries, search, status]);

  // Newest first by default — the inbox is worked from the top.
  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    filtered,
    { key: "received", dir: "desc" },
    {
      sender: (r) => `${r.lastName} ${r.firstName}`,
      subject: (r) => r.subjectLabel,
      received: (r) => r.submittedAt,
      status: (r) => r.status,
    },
  );

  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const open = openId ? (inquiries.find((record) => record.id === openId) ?? null) : null;

  // Global-search results link here as ?review=<id>. Gated on `active` so the
  // feedback panel's deep link is not consumed by whichever mounted first.
  useEditDeepLink(
    "review",
    (id) => {
      if (inquiries.some((record) => record.id === id)) {
        setFormError(null);
        setOpenId(id);
      } else {
        showError("That inquiry no longer exists.");
      }
    },
    active,
  );

  const closeDrawer = () => {
    setOpenId(null);
    setFormError(null);
  };

  const handleSave = (id: string, values: InquiryUpdateValues) => {
    setFormError(null);
    startTransition(async () => {
      const result = await updateInquiry(id, values);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      closeDrawer();
      showToast("Inquiry updated.");
    });
  };

  /** The kebab's one-click moves. They keep whatever note is already saved. */
  const setStatusFor = (record: InquiryRow, next: InquiryStatus, message: string) => {
    startTransition(async () => {
      const result = await updateInquiry(record.id, { status: next, staffNote: record.staffNote });
      if (result.error) {
        showError(result.error);
        return;
      }
      showToast(message);
    });
  };

  const clearFilters = () => {
    setSearch("");
    setStatus("all");
    setPage(1);
  };

  return (
    <>
      <div className="mb-6 grid gap-6 sm:grid-cols-3">
        <AdminStatCard icon={MessagesSquare} label="Total Inquiries" value={inquiries.length} />
        <AdminStatCard
          icon={Inbox}
          label="Unopened"
          value={newCount}
          tone={newCount > 0 ? "danger" : "secondary"}
        />
        <AdminStatCard icon={MailOpen} label="In Progress" value={inProgressCount} tone="secondary" />
      </div>
      <Card>
        <CardHeader
          title="Inbox"
          className="mb-0 flex-wrap gap-3 px-6 pt-6"
          action={
            <AdminFilterBar
              search={{
                id: "inquiry-search",
                value: search,
                placeholder: "Search name, email or message…",
                onChange: (value) => {
                  setSearch(value);
                  setPage(1);
                },
              }}
              selects={[
                {
                  id: "inquiry-status-filter",
                  label: "Status",
                  value: status,
                  options: [
                    { value: "all", label: "All Statuses" },
                    ...INQUIRY_STATUS_OPTIONS,
                  ],
                  onChange: (value) => {
                    setStatus(value);
                    setPage(1);
                  },
                },
              ]}
            />
          }
        />
        {filtered.length === 0 ? (
          <AdminEmptyState
            message={
              inquiries.length === 0
                ? "No inquiries yet. Messages from the contact form land here."
                : "No inquiries match your filters."
            }
            onClear={clearFilters}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <SortableTh label="From" sortKey="sender" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Subject" sortKey="subject" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Received" sortKey="received" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((record) => {
                    const name = `${record.firstName} ${record.lastName}`;
                    return (
                      <tr key={record.id} className="border-b border-ink-200/40 last:border-b-0">
                        <td className="px-6 py-4">
                          <p className="font-semibold text-ink-900">{name}</p>
                          <p className="text-xs text-ink-500">{record.email}</p>
                        </td>
                        <td className="px-6 py-4 text-ink-600">
                          <p>{record.subjectLabel}</p>
                          <p className="line-clamp-1 max-w-80 text-xs text-ink-500">
                            {record.message}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-ink-600">{formatDate(record.submittedAt)}</td>
                        <td className="px-6 py-4">
                          <StatusChip status={record.status} />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setFormError(null);
                                setOpenId(record.id);
                              }}
                              aria-label={`Open the inquiry from ${name}`}
                              className="text-sm font-semibold text-brand-700 hover:underline"
                            >
                              Open
                            </button>
                            <RowActions
                              label={name}
                              actions={[
                                {
                                  label: "Mark in progress",
                                  icon: MailOpen,
                                  disabled: record.status === "in_progress",
                                  onSelect: () =>
                                    setStatusFor(record, "in_progress", `Took up ${name}'s inquiry.`),
                                },
                                {
                                  label: "Mark answered",
                                  icon: CheckCircle2,
                                  disabled: record.status === "answered",
                                  onSelect: () =>
                                    setStatusFor(record, "answered", `Marked ${name}'s inquiry answered.`),
                                },
                                {
                                  // Closing is not destructive — the message stays
                                  // and the row can be reopened — so no confirm.
                                  label: "Close without reply",
                                  icon: XCircle,
                                  tone: "danger",
                                  disabled: record.status === "closed",
                                  onSelect: () => setStatusFor(record, "closed", "Inquiry closed."),
                                },
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <AdminPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={filtered.length}
              onPageChange={setPage}
              className="px-6 py-4"
            />
          </>
        )}
      </Card>
      <Drawer open={open !== null} onClose={closeDrawer} title="Inquiry">
        {open ? (
          <InquiryDrawer
            key={open.id}
            record={open}
            onSave={handleSave}
            onCancel={closeDrawer}
            saving={isPending}
            error={formError}
          />
        ) : null}
      </Drawer>
      {toast ? (
        <Toast key={toast.id} message={toast.message} tone={toast.tone} onDismiss={dismissToast} />
      ) : null}
    </>
  );
}
