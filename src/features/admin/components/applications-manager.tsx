"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { CheckCircle2, ClipboardList, FileText, Plus } from "lucide-react";
import type {
  AdminTicketUpdate,
  ApplicationReviewValues,
  ApplicationRow,
  WalkInApplicationValues,
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
  createWalkInApplication,
  releaseApplication,
  reviewApplication,
} from "@/features/admin/actions/applications";
import { getTicketUpdatesAction } from "@/features/admin/actions/ticket-updates";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminPagination } from "./admin-pagination";
import { AdminStatCard } from "./admin-stat-card";
import { ApplicationForm } from "./application-form";
import { ApplicationReviewDrawer } from "./application-review-drawer";
import { StatusChip } from "./status-chip";

const PAGE_SIZE = 6;

interface ApplicationsManagerProps {
  applications: ApplicationRow[];
  services: { id: string; title: string }[];
}

/**
 * Certificate application queue. Rows come from the server; every action is a
 * Server Action that revalidates the page, so the list refreshes from the DB
 * rather than from local state.
 */
export function ApplicationsManager({ applications, services }: ApplicationsManagerProps) {
  const [search, setSearch] = useState("");
  const [serviceId, setServiceId] = useState("all");
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
        const rows = await getTicketUpdatesAction("application", ticketNo);
        if (seq !== requestSeq.current) return; // a later drawer won the race
        setUpdates(rows);
      } catch {
        if (seq !== requestSeq.current) return;
        showError("Could not load the timeline.");
      }
    });
  };

  const totalCount = applications.length;
  const pendingCount = applications.filter((record) => record.status === "pending").length;
  const approvedCount = applications.filter((record) => record.status === "approved").length;

  const filtered = useMemo(() => {
    const narrowed = applications.filter(
      (record) =>
        (serviceId === "all" || record.serviceId === serviceId) &&
        (status === "all" || record.status === status),
    );
    return fuzzyFilter(narrowed, search, (record) =>
      haystack(
        record.firstName,
        record.lastName,
        record.ticketNo,
        record.contactNumber,
        record.email,
        record.serviceTitle,
        record.purpose,
      ),
    );
  }, [applications, search, serviceId, status]);

  // Newest first by default — the queue is worked from the top.
  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    filtered,
    { key: "date", dir: "desc" },
    {
      applicant: (r) => `${r.lastName} ${r.firstName}`,
      service: (r) => r.serviceTitle,
      date: (r) => r.submittedAt,
      status: (r) => r.status,
    },
  );

  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const reviewing = reviewingId
    ? (applications.find((record) => record.id === reviewingId) ?? null)
    : null;

  // Global-search results link here as ?review=<id>.
  useEditDeepLink("review", (id) => {
    const record = applications.find((row) => row.id === id);
    if (record) {
      setFormError(null);
      setReviewingId(id);
      loadUpdates(record.ticketNo);
    } else {
      showError("That application no longer exists.");
    }
  });

  const closeReview = () => {
    setReviewingId(null);
    setFormError(null);
    setUpdates([]);
  };

  const handleReview = (id: string, values: ApplicationReviewValues) => {
    setFormError(null);
    startTransition(async () => {
      try {
        const result = await reviewApplication(id, values);
        if (result.error) {
          setFormError(result.error);
          return;
        }
        closeReview();
        showToast(values.status === "approved" ? "Application approved." : "Application rejected.");
      } catch {
        setFormError("Something went wrong. Please try again.");
      }
    });
  };

  const handleRelease = (id: string) => {
    setFormError(null);
    startTransition(async () => {
      try {
        const result = await releaseApplication(id);
        if (result.error) {
          setFormError(result.error);
          return;
        }
        closeReview();
        showToast("Marked as released.");
      } catch {
        setFormError("Something went wrong. Please try again.");
      }
    });
  };

  const handleCreate = (values: WalkInApplicationValues) => {
    setFormError(null);
    startTransition(async () => {
      try {
        const result = await createWalkInApplication(values);
        if (result.error) {
          setFormError(result.error);
          return;
        }
        setCreateOpen(false);
        setPage(1);
        showToast("Walk-in application encoded.");
      } catch {
        setFormError("Something went wrong. Please try again.");
      }
    });
  };

  const clearFilters = () => {
    setSearch("");
    setServiceId("all");
    setStatus("all");
    setPage(1);
  };

  return (
    <>
      <AdminPageHeader
        title="Certificate Applications"
        description="Manage and review incoming requests for barangay certificates and clearances."
        action={
          <Button
            onClick={() => {
              setFormError(null);
              setCreateOpen(true);
            }}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            New Application
          </Button>
        }
      />
      <div className="mb-6 grid gap-6 sm:grid-cols-3">
        <AdminStatCard icon={FileText} label="Total Applications" value={totalCount} />
        <AdminStatCard
          icon={ClipboardList}
          label="Pending Review"
          value={pendingCount}
          tone={pendingCount > 0 ? "danger" : "secondary"}
        />
        <AdminStatCard
          icon={CheckCircle2}
          label="Ready for Pickup"
          value={approvedCount}
          tone="secondary"
        />
      </div>
      <Card>
        <CardHeader
          title="Application Queue"
          className="mb-0 flex-wrap gap-3 px-6 pt-6"
          action={
            <AdminFilterBar
              search={{
                id: "application-search",
                value: search,
                placeholder: "Search name or ticket no…",
                onChange: (value) => {
                  setSearch(value);
                  setPage(1);
                },
              }}
              selects={[
                {
                  id: "application-service-filter",
                  label: "Document type",
                  value: serviceId,
                  options: [
                    { value: "all", label: "All Document Types" },
                    ...services.map((service) => ({ value: service.id, label: service.title })),
                  ],
                  onChange: (value) => {
                    setServiceId(value);
                    setPage(1);
                  },
                },
                {
                  id: "application-status-filter",
                  label: "Status",
                  value: status,
                  options: [
                    { value: "all", label: "All Statuses" },
                    { value: "pending", label: "Pending" },
                    { value: "approved", label: "Approved" },
                    { value: "released", label: "Released" },
                    { value: "rejected", label: "Rejected" },
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
              applications.length === 0
                ? "No applications yet. Residents' online requests land here."
                : "No applications match your filters."
            }
            onClear={clearFilters}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <SortableTh label="Applicant" sortKey="applicant" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Document Type" sortKey="service" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Date Applied" sortKey="date" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
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
                      <td className="px-6 py-4 text-ink-600">{record.serviceTitle}</td>
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
      <Drawer open={reviewing !== null} onClose={closeReview} title="Application Details">
        {reviewing ? (
          <ApplicationReviewDrawer
            key={reviewing.id}
            record={reviewing}
            onReview={handleReview}
            onRelease={handleRelease}
            onCancel={closeReview}
            saving={isPending}
            error={formError}
            onDismissError={() => setFormError(null)}
            updates={updates}
            onPosted={() => loadUpdates(reviewing.ticketNo)}
          />
        ) : null}
      </Drawer>
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="New Application">
        {createOpen ? (
          <ApplicationForm
            services={services}
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
