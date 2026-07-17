"use client";

import { useMemo, useState, useTransition } from "react";
import { ClipboardList, FileText, HeartHandshake, Plus } from "lucide-react";
import type {
  AssistanceCategoryRow,
  AssistanceDecisionValues,
  AssistanceReviewValues,
  AssistanceRow,
  WalkInAssistanceValues,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import {
  createWalkInAssistance,
  decideAssistance,
  reviewAssistance,
} from "@/features/admin/actions/assistance";
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
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeCategories = useMemo(
    () => categories.filter((category) => category.isActive),
    [categories],
  );

  const totalCount = requests.length;
  const pendingCount = requests.filter((record) => record.status === "pending").length;
  const underReviewCount = requests.filter((record) => record.status === "under-review").length;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return requests.filter(
      (record) =>
        (query === "" ||
          `${record.firstName} ${record.lastName}`.toLowerCase().includes(query) ||
          record.ticketNo.toLowerCase().includes(query)) &&
        (categoryId === "all" || record.categoryId === categoryId) &&
        (status === "all" || record.status === status),
    );
  }, [requests, search, categoryId, status]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const reviewing = reviewingId
    ? (requests.find((record) => record.id === reviewingId) ?? null)
    : null;

  const closeReview = () => {
    setReviewingId(null);
    setFormError(null);
  };

  const handleReview = (id: string, values: AssistanceReviewValues) => {
    setFormError(null);
    startTransition(async () => {
      const result = await reviewAssistance(id, values);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      closeReview();
      setToast(
        values.status === "under-review"
          ? "Request taken up for review."
          : "Request declined.",
      );
    });
  };

  const handleDecide = (id: string, values: AssistanceDecisionValues) => {
    setFormError(null);
    startTransition(async () => {
      const result = await decideAssistance(id, values);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      closeReview();
      setToast(values.status === "granted" ? "Request granted." : "Request declined.");
    });
  };

  const handleCreate = (values: WalkInAssistanceValues) => {
    setFormError(null);
    startTransition(async () => {
      const result = await createWalkInAssistance(values);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setCreateOpen(false);
      setPage(1);
      setToast("Walk-in request encoded.");
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
                    <th scope="col" className="px-6 py-4">Resident</th>
                    <th scope="col" className="px-6 py-4">Category</th>
                    <th scope="col" className="px-6 py-4">Date Filed</th>
                    <th scope="col" className="px-6 py-4">Status</th>
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
          />
        ) : null}
      </Drawer>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
