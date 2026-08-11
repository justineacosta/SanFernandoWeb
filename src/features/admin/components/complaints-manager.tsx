"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { ClipboardList, FileText, Plus, Scale } from "lucide-react";
import type {
  AdminTicketUpdate,
  ComplaintReviewValues,
  ComplaintCloseValues,
  ComplaintRow,
  WalkInComplaintValues,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { SortableTh } from "@/components/ui/sortable-th";
import { Toast } from "@/components/ui/toast";
import { useTableSort } from "@/components/ui/use-table-sort";
import { useEditDeepLink } from "@/hooks/use-edit-deep-link";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { fuzzyFilter, haystack } from "@/lib/fuzzy";
import {
  closeComplaint,
  createWalkInComplaint,
  reviewComplaint,
} from "@/features/admin/actions/complaints";
import { getTicketUpdatesAction } from "@/features/admin/actions/ticket-updates";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminPagination } from "./admin-pagination";
import { AdminStatCard } from "./admin-stat-card";
import { ComplaintForm } from "./complaint-form";
import { ComplaintReviewDrawer } from "./complaint-review-drawer";
import { StatusChip } from "./status-chip";

const PAGE_SIZE = 6;

interface ComplaintsManagerProps {
  complaints: ComplaintRow[];
}

/**
 * Incident report queue. Rows come from the server; every action is a
 * Server Action that revalidates the page, so the list refreshes from the DB
 * rather than from local state.
 */
export function ComplaintsManager({ complaints }: ComplaintsManagerProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [updates, setUpdates] = useState<AdminTicketUpdate[]>([]);
  // Guards against a stale response: closing ticket A's drawer and opening
  // ticket B's before A's fetch resolves would otherwise render A's timeline —
  // internal staff notes included — under B's ticket number.
  const requestSeq = useRef(0);
  const { toast, showToast, showError, dismissToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const loadUpdates = (ticketNo: string) => {
    const seq = ++requestSeq.current;
    startTransition(async () => {
      try {
        const rows = await getTicketUpdatesAction("complaint", ticketNo);
        if (seq !== requestSeq.current) return; // a later drawer won the race
        setUpdates(rows);
      } catch {
        if (seq !== requestSeq.current) return;
        showError("Could not load the timeline.");
      }
    });
  };

  const totalCount = complaints.length;
  const receivedCount = complaints.filter((record) => record.status === "received").length;
  const underReviewCount = complaints.filter((record) => record.status === "under-review").length;

  const filtered = useMemo(() => {
    const narrowed = complaints.filter(
      (record) => status === "all" || record.status === status,
    );
    return fuzzyFilter(narrowed, search, (record) =>
      haystack(
        record.firstName,
        record.lastName,
        record.ticketNo,
        record.contactNumber,
        record.email,
        record.respondent,
        record.location,
      ),
    );
  }, [complaints, search, status]);

  // Newest first by default — the queue is worked from the top.
  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    filtered,
    { key: "filed", dir: "desc" },
    {
      complainant: (r) => `${r.lastName} ${r.firstName}`,
      location: (r) => r.location,
      filed: (r) => r.submittedAt,
      status: (r) => r.status,
    },
  );

  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const reviewing = reviewingId
    ? (complaints.find((record) => record.id === reviewingId) ?? null)
    : null;

  // Global-search results link here as ?review=<id>.
  useEditDeepLink("review", (id) => {
    const record = complaints.find((row) => row.id === id);
    if (record) {
      setFormError(null);
      setReviewingId(id);
      loadUpdates(record.ticketNo);
    } else {
      showError("That report no longer exists.");
    }
  });

  const closeReview = () => {
    setReviewingId(null);
    setFormError(null);
    setUpdates([]);
  };

  const handleReview = (id: string, values: ComplaintReviewValues) => {
    setFormError(null);
    startTransition(async () => {
      try {
        const result = await reviewComplaint(id, values);
        if (result.error) {
          setFormError(result.error);
          return;
        }
        closeReview();
        showToast(
          values.status === "under-review" ? "Report taken up for mediation." : "Report dismissed.",
        );
      } catch {
        setFormError("Something went wrong. Please try again.");
      }
    });
  };

  const handleClose = (id: string, values: ComplaintCloseValues) => {
    setFormError(null);
    startTransition(async () => {
      try {
        const result = await closeComplaint(id, values);
        if (result.error) {
          setFormError(result.error);
          return;
        }
        closeReview();
        showToast(values.status === "resolved" ? "Report resolved." : "Report dismissed.");
      } catch {
        setFormError("Something went wrong. Please try again.");
      }
    });
  };

  const handleCreate = (values: WalkInComplaintValues, files: File[]) => {
    setFormError(null);
    startTransition(async () => {
      try {
        const result = await createWalkInComplaint(values, files);
        if (result.error) {
          setFormError(result.error);
          return;
        }
        setCreateOpen(false);
        setPage(1);
        showToast(result.attachmentWarning ?? "Walk-in report encoded.");
      } catch {
        setFormError("Something went wrong. Please try again.");
      }
    });
  };

  const clearFilters = () => {
    setSearch("");
    setStatus("all");
    setPage(1);
  };

  return (
    <>
      <AdminPageHeader
        title="Incident Reports"
        description="Review, mediate and close reports filed by residents."
        action={
          <Button
            onClick={() => {
              setFormError(null);
              setCreateOpen(true);
            }}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            New Report
          </Button>
        }
      />
      <div className="mb-6 grid gap-6 sm:grid-cols-3">
        <AdminStatCard icon={FileText} label="Total Reports" value={totalCount} />
        <AdminStatCard
          icon={ClipboardList}
          label="Awaiting Review"
          value={receivedCount}
          tone={receivedCount > 0 ? "danger" : "secondary"}
        />
        <AdminStatCard
          icon={Scale}
          label="Under Mediation"
          value={underReviewCount}
          tone="secondary"
        />
      </div>
      <Card>
        <CardHeader
          title="Report Queue"
          className="mb-0 flex-wrap gap-3 px-6 pt-6"
          action={
            <AdminFilterBar
              search={{
                id: "complaint-search",
                value: search,
                placeholder: "Search name or ticket no…",
                onChange: (value) => {
                  setSearch(value);
                  setPage(1);
                },
              }}
              selects={[
                {
                  id: "complaint-status-filter",
                  label: "Status",
                  value: status,
                  options: [
                    { value: "all", label: "All Statuses" },
                    { value: "received", label: "Received" },
                    { value: "under-review", label: "Under Review" },
                    { value: "awaiting-info", label: "Awaiting Information" },
                    { value: "resolved", label: "Resolved" },
                    { value: "dismissed", label: "Dismissed" },
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
              complaints.length === 0
                ? "No reports yet. Residents' online reports land here."
                : "No reports match your filters."
            }
            onClear={clearFilters}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <SortableTh label="Complainant" sortKey="complainant" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Where It Happened" sortKey="location" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Date Filed" sortKey="filed" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((record) => (
                    <tr key={record.id} className="border-b border-ink-200/40 last:border-b-0">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-ink-900">
                          {record.firstName} {record.lastName}
                        </p>
                        <p className="text-xs text-ink-500">
                          {record.ticketNo}
                          {record.source === "walk-in" ? " · walk-in" : ""}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-ink-600">{record.location}</td>
                      <td className="px-6 py-4 text-ink-600">{formatDate(record.submittedAt)}</td>
                      <td className="px-6 py-4">
                        <StatusChip status={record.status} />
                        {record.repliedAt ? (
                          <span className="ml-2 inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800">
                            New reply
                          </span>
                        ) : null}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setFormError(null);
                            setReviewingId(record.id);
                            loadUpdates(record.ticketNo);
                          }}
                          aria-label={`Review ${record.ticketNo}`}
                          className="text-sm font-semibold text-brand-700 hover:underline"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
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
      <Drawer open={reviewing !== null} onClose={closeReview} title="Report Details">
        {reviewing ? (
          <ComplaintReviewDrawer
            key={reviewing.id}
            record={reviewing}
            onReview={handleReview}
            onClose={handleClose}
            onCancel={closeReview}
            saving={isPending}
            error={formError}
            onDismissError={() => setFormError(null)}
            updates={updates}
            onPosted={() => loadUpdates(reviewing.ticketNo)}
          />
        ) : null}
      </Drawer>
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="New Report">
        {createOpen ? (
          <ComplaintForm
            onSubmit={handleCreate}
            onCancel={() => setCreateOpen(false)}
            saving={isPending}
            error={formError}
            onDismissError={() => setFormError(null)}
          />
        ) : null}
      </Drawer>
      {toast ? (
        <Toast key={toast.id} message={toast.message} tone={toast.tone} onDismiss={dismissToast} />
      ) : null}
    </>
  );
}
