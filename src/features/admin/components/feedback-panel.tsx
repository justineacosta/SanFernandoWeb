"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Inbox, MailOpen, MessagesSquare, Star, Trash2, XCircle } from "lucide-react";
import type { FeedbackRow, FeedbackStatus, FeedbackUpdateValues } from "@/types";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer } from "@/components/ui/drawer";
import { RowActions, type RowAction } from "@/components/ui/row-actions";
import { SortableTh } from "@/components/ui/sortable-th";
import { Toast } from "@/components/ui/toast";
import { useTableSort } from "@/components/ui/use-table-sort";
import { useEditDeepLink } from "@/hooks/use-edit-deep-link";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { fuzzyFilter, haystack } from "@/lib/fuzzy";
import { deleteFeedback, updateFeedback } from "@/features/admin/actions/feedback";
import { FEEDBACK_CATEGORIES, averageRating } from "@/features/feedback/data";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPagination } from "./admin-pagination";
import { AdminStatCard } from "./admin-stat-card";
import { FeedbackDrawer, FEEDBACK_STATUS_OPTIONS } from "./feedback-drawer";
import { StatusChip } from "./status-chip";

const PAGE_SIZE = 8;

interface FeedbackPanelProps {
  records: FeedbackRow[];
  /** Decides whether Delete is offered. Presentation only — the action re-checks. */
  isSuperAdmin: boolean;
  /** False while the other tab is showing: only the visible panel consumes ?review=. */
  active: boolean;
}

/**
 * The site-feedback queue.
 *
 * Not a ticket queue and not an inbox: nobody can be written back to, so the
 * only forward actions are "someone is looking at this", "the thing is fixed",
 * and "this is spam". There is no New button — every row arrived from the
 * floating widget on the public site.
 */
export function FeedbackPanel({ records, isSuperAdmin, active }: FeedbackPanelProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<{ id: string; subject: string } | null>(
    null,
  );
  const [actionPending, setActionPending] = useState(false);
  const { toast, showToast, showError, dismissToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const newCount = records.filter((record) => record.status === "new").length;
  const average = averageRating(records);

  const filtered = useMemo(() => {
    const narrowed = records.filter(
      (record) =>
        (category === "all" || record.category === category) &&
        (status === "all" || record.status === status),
    );
    return fuzzyFilter(narrowed, search, (record) =>
      haystack(record.subject, record.message, record.categoryLabel, record.pagePath),
    );
  }, [records, search, category, status]);

  // Newest first: the queue is worked from the top.
  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    filtered,
    { key: "received", dir: "desc" },
    {
      category: (r) => r.categoryLabel,
      subject: (r) => r.subject,
      // Unrated sorts as -1 so it lands at one end rather than mixing with 1s.
      rating: (r) => r.rating ?? -1,
      received: (r) => r.submittedAt,
      status: (r) => r.status,
    },
  );

  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const open = openId ? (records.find((record) => record.id === openId) ?? null) : null;

  // Global-search results arrive as ?tab=feedback&review=<id>.
  useEditDeepLink(
    "review",
    (id) => {
      if (records.some((record) => record.id === id)) {
        setFormError(null);
        setOpenId(id);
      } else {
        showError("That feedback no longer exists.");
      }
    },
    active,
  );

  const closeDrawer = () => {
    setOpenId(null);
    setFormError(null);
  };

  const handleSave = (id: string, values: FeedbackUpdateValues) => {
    setFormError(null);
    startTransition(async () => {
      const result = await updateFeedback(id, values);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      closeDrawer();
      showToast("Feedback updated.");
      router.refresh();
    });
  };

  /** The kebab's one-click moves. They keep whatever note is already saved. */
  const setStatusFor = (record: FeedbackRow, next: FeedbackStatus, message: string) => {
    startTransition(async () => {
      const result = await updateFeedback(record.id, { status: next, staffNote: record.staffNote });
      if (result.error) {
        showError(result.error);
        return;
      }
      showToast(message);
      router.refresh();
    });
  };

  const runDelete = () => {
    if (!confirmingDelete) return;
    const { id, subject } = confirmingDelete;
    setActionPending(true);
    startTransition(async () => {
      const result = await deleteFeedback(id);
      setActionPending(false);
      setConfirmingDelete(null);
      if (result.error) {
        showError(result.error);
        return;
      }
      showToast(`Deleted "${subject}".`);
      router.refresh();
    });
  };

  const rowActions = (record: FeedbackRow): RowAction[] => {
    const actions: RowAction[] = [
      {
        label: "Mark in progress",
        icon: MailOpen,
        disabled: record.status === "in_progress",
        onSelect: () => setStatusFor(record, "in_progress", "Took up the feedback."),
      },
      {
        label: "Mark resolved",
        icon: CheckCircle2,
        disabled: record.status === "resolved",
        onSelect: () => setStatusFor(record, "resolved", "Marked the feedback resolved."),
      },
      {
        // Not destructive: the row stays and can be reopened, so no confirm.
        label: "Dismiss",
        icon: XCircle,
        tone: "danger",
        disabled: record.status === "dismissed",
        onSelect: () => setStatusFor(record, "dismissed", "Feedback dismissed."),
      },
    ];
    // Two conditions, matching the umbrella rule: SuperAdmin, and only from a
    // record already dismissed. The action re-checks both server-side.
    if (isSuperAdmin && record.status === "dismissed") {
      actions.push({
        label: "Delete",
        icon: Trash2,
        tone: "danger",
        onSelect: () => setConfirmingDelete({ id: record.id, subject: record.subject }),
      });
    }
    return actions;
  };

  const clearFilters = () => {
    setSearch("");
    setCategory("all");
    setStatus("all");
    setPage(1);
  };

  return (
    <>
      <div className="mb-6 grid gap-6 sm:grid-cols-3">
        <AdminStatCard icon={MessagesSquare} label="Total Feedback" value={records.length} />
        <AdminStatCard
          icon={Inbox}
          label="Unreviewed"
          value={newCount}
          tone={newCount > 0 ? "danger" : "secondary"}
        />
        <AdminStatCard
          icon={Star}
          label="Average Rating"
          value={average === null ? "—" : average.toFixed(1)}
          tone="secondary"
        />
      </div>
      <Card>
        <CardHeader
          title="Website Feedback"
          className="mb-0 flex-wrap gap-3 px-6 pt-6"
          action={
            <AdminFilterBar
              search={{
                id: "feedback-search",
                value: search,
                placeholder: "Search subject, message or page…",
                onChange: (value) => {
                  setSearch(value);
                  setPage(1);
                },
              }}
              selects={[
                {
                  id: "feedback-category-filter",
                  label: "Category",
                  value: category,
                  options: [
                    { value: "all", label: "All Categories" },
                    ...FEEDBACK_CATEGORIES.map((entry) => ({
                      value: entry.value,
                      label: entry.label,
                    })),
                  ],
                  onChange: (value) => {
                    setCategory(value);
                    setPage(1);
                  },
                },
                {
                  id: "feedback-status-filter",
                  label: "Status",
                  value: status,
                  options: [{ value: "all", label: "All Statuses" }, ...FEEDBACK_STATUS_OPTIONS],
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
              records.length === 0
                ? "No feedback yet. Notes sent from the button on the public site land here."
                : "No feedback matches your filters."
            }
            onClear={records.length === 0 ? undefined : clearFilters}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <SortableTh label="Category" sortKey="category" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Subject" sortKey="subject" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Rating" sortKey="rating" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <th scope="col" className="px-6 py-4">Page</th>
                    <SortableTh label="Received" sortKey="received" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((record) => (
                    <tr key={record.id} className="border-b border-ink-200/40 last:border-b-0">
                      <td className="px-6 py-4 text-ink-600">{record.categoryLabel}</td>
                      <td className="max-w-80 px-6 py-4">
                        <p className="font-semibold text-ink-900">{record.subject}</p>
                        <p className="line-clamp-1 text-xs text-ink-500">{record.message}</p>
                      </td>
                      <td className="px-6 py-4 tabular-nums text-ink-600">
                        {record.rating ? `★ ${record.rating}` : "—"}
                      </td>
                      <td className="max-w-40 truncate px-6 py-4 font-mono text-xs text-ink-500">
                        {record.pagePath || "—"}
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
                            aria-label={`Open the feedback "${record.subject}"`}
                            className="text-sm font-semibold text-brand-700 hover:underline"
                          >
                            Open
                          </button>
                          <RowActions label={record.subject} actions={rowActions(record)} />
                        </div>
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
      <Drawer open={open !== null} onClose={closeDrawer} title="Feedback">
        {open ? (
          <FeedbackDrawer
            key={open.id}
            record={open}
            onSave={handleSave}
            onCancel={closeDrawer}
            saving={isPending}
            error={formError}
          />
        ) : null}
      </Drawer>
      <ConfirmDialog
        open={confirmingDelete !== null}
        title="Delete this feedback?"
        body={
          <>
            <strong className="font-semibold text-ink-900">{confirmingDelete?.subject}</strong> and
            any screenshot attached to it will be removed permanently. This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        pending={actionPending}
        onConfirm={runDelete}
        onCancel={() => setConfirmingDelete(null)}
      />
      {toast ? (
        <Toast key={toast.id} message={toast.message} tone={toast.tone} onDismiss={dismissToast} />
      ) : null}
    </>
  );
}
