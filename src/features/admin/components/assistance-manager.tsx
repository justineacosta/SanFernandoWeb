"use client";

import { useMemo, useState, useTransition } from "react";
import { ClipboardList, FileText, HeartHandshake, Plus } from "lucide-react";
import type {
  AdminTicketUpdate,
  AssistanceCategoryRow,
  AssistanceDecisionValues,
  AssistanceReviewValues,
  AssistanceRow,
  WalkInAssistanceValues,
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
  createWalkInAssistance,
  decideAssistance,
  reviewAssistance,
} from "@/features/admin/actions/assistance";
import { getTicketUpdatesAction } from "@/features/admin/actions/ticket-updates";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminPagination } from "./admin-pagination";
import { AdminStatCard } from "./admin-stat-card";
import { AssistanceForm } from "./assistance-form";
import { AssistanceReviewDrawer } from "./assistance-review-drawer";
import { StatusChip } from "./status-chip";

const PAGE_SIZE = 6;

interface AssistanceManagerProps {
  requests: AssistanceRow[];
  categories: AssistanceCategoryRow[];
}

/**
 * Assistance request queue. Rows come from the server; every action is a
 * Server Action that revalidates the page, so the list refreshes from the DB
 * rather than from local state.
 */
export function AssistanceManager({ requests, categories }: AssistanceManagerProps) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [updates, setUpdates] = useState<AdminTicketUpdate[]>([]);
  const { toast, showToast, showError, dismissToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const loadUpdates = (ticketNo: string) => {
    startTransition(async () => {
      try {
        setUpdates(await getTicketUpdatesAction("assistance", ticketNo));
      } catch {
        showError("Could not load the timeline.");
      }
    });
  };

  const activeCategories = useMemo(
    () => categories.filter((category) => category.isActive),
    [categories],
  );

  const totalCount = requests.length;
  const pendingCount = requests.filter((record) => record.status === "pending").length;
  const underReviewCount = requests.filter((record) => record.status === "under-review").length;

  const filtered = useMemo(() => {
    const narrowed = requests.filter(
      (record) =>
        (categoryId === "all" || record.categoryId === categoryId) &&
        (status === "all" || record.status === status),
    );
    return fuzzyFilter(narrowed, search, (record) =>
      haystack(
        record.firstName,
        record.lastName,
        record.ticketNo,
        record.contactNumber,
        record.email,
        record.categoryLabel,
      ),
    );
  }, [requests, search, categoryId, status]);

  // Newest first by default — the queue is worked from the top.
  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    filtered,
    { key: "filed", dir: "desc" },
    {
      resident: (r) => `${r.lastName} ${r.firstName}`,
      category: (r) => r.categoryLabel,
      filed: (r) => r.submittedAt,
      status: (r) => r.status,
    },
  );

  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const reviewing = reviewingId
    ? (requests.find((record) => record.id === reviewingId) ?? null)
    : null;

  // Global-search results link here as ?review=<id>.
  useEditDeepLink("review", (id) => {
    const record = requests.find((row) => row.id === id);
    if (record) {
      setFormError(null);
      setReviewingId(id);
      loadUpdates(record.ticketNo);
    } else {
      showError("That request no longer exists.");
    }
  });

  const closeReview = () => {
    setReviewingId(null);
    setFormError(null);
    setUpdates([]);
  };

  const handleReview = (id: string, values: AssistanceReviewValues) => {
    setFormError(null);
    startTransition(async () => {
      try {
        const result = await reviewAssistance(id, values);
        if (result.error) {
          setFormError(result.error);
          return;
        }
        closeReview();
        showToast(
          values.status === "under-review"
            ? "Request taken up for review."
            : "Request declined.",
        );
      } catch {
        setFormError("Something went wrong. Please try again.");
      }
    });
  };

  const handleDecide = (id: string, values: AssistanceDecisionValues) => {
    setFormError(null);
    startTransition(async () => {
      try {
        const result = await decideAssistance(id, values);
        if (result.error) {
          setFormError(result.error);
          return;
        }
        closeReview();
        showToast(values.status === "granted" ? "Request granted." : "Request declined.");
      } catch {
        setFormError("Something went wrong. Please try again.");
      }
    });
  };

  const handleCreate = (values: WalkInAssistanceValues) => {
    setFormError(null);
    startTransition(async () => {
      try {
        const result = await createWalkInAssistance(values);
        if (result.error) {
          setFormError(result.error);
          return;
        }
        setCreateOpen(false);
        setPage(1);
        showToast("Walk-in request encoded.");
      } catch {
        setFormError("Something went wrong. Please try again.");
      }
    });
  };

  const clearFilters = () => {
    setSearch("");
    setCategoryId("all");
    setStatus("all");
    setPage(1);
  };

  return (
    <>
      <AdminPageHeader
        title="Assistance Requests"
        description="Review and decide social service assistance requests."
        action={
          <Button
            onClick={() => {
              setFormError(null);
              setCreateOpen(true);
            }}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            New Request
          </Button>
        }
      />
      <div className="mb-6 grid gap-6 sm:grid-cols-3">
        <AdminStatCard icon={HeartHandshake} label="Total Requests" value={totalCount} />
        <AdminStatCard
          icon={ClipboardList}
          label="Awaiting Review"
          value={pendingCount}
          tone={pendingCount > 0 ? "danger" : "secondary"}
        />
        <AdminStatCard
          icon={FileText}
          label="Under Review"
          value={underReviewCount}
          tone="secondary"
        />
      </div>
      <Card>
        <CardHeader
          title="Request Queue"
          className="mb-0 flex-wrap gap-3 px-6 pt-6"
          action={
            <AdminFilterBar
              search={{
                id: "assistance-search",
                value: search,
                placeholder: "Search name or ticket no…",
                onChange: (value) => {
                  setSearch(value);
                  setPage(1);
                },
              }}
              selects={[
                {
                  id: "assistance-category-filter",
                  label: "Category",
                  value: categoryId,
                  options: [
                    { value: "all", label: "All Categories" },
                    ...categories.map((category) => ({ value: category.id, label: category.label })),
                  ],
                  onChange: (value) => {
                    setCategoryId(value);
                    setPage(1);
                  },
                },
                {
                  id: "assistance-status-filter",
                  label: "Status",
                  value: status,
                  options: [
                    { value: "all", label: "All Statuses" },
                    { value: "pending", label: "Pending" },
                    { value: "under-review", label: "Under Review" },
                    { value: "granted", label: "Granted" },
                    { value: "declined", label: "Declined" },
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
              requests.length === 0
                ? "No assistance requests yet. Residents' online requests land here."
                : "No requests match your filters."
            }
            onClear={clearFilters}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <SortableTh label="Resident" sortKey="resident" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Category" sortKey="category" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
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
                      <td className="px-6 py-4 text-ink-600">{record.categoryLabel}</td>
                      <td className="px-6 py-4 text-ink-600">{formatDate(record.submittedAt)}</td>
                      <td className="px-6 py-4">
                        <StatusChip status={record.status} />
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
      <Drawer open={reviewing !== null} onClose={closeReview} title="Request Details">
        {reviewing ? (
          <AssistanceReviewDrawer
            key={reviewing.id}
            record={reviewing}
            onReview={handleReview}
            onDecide={handleDecide}
            onCancel={closeReview}
            saving={isPending}
            error={formError}
            onDismissError={() => setFormError(null)}
            updates={updates}
            onPosted={() => loadUpdates(reviewing.ticketNo)}
          />
        ) : null}
      </Drawer>
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="New Request">
        {createOpen ? (
          <AssistanceForm
            categories={activeCategories}
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
