"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, ClipboardList, FileText, Plus } from "lucide-react";
import type { ApplicationReviewValues, ApplicationRow, WalkInApplicationValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import {
  createWalkInApplication,
  releaseApplication,
  reviewApplication,
} from "@/features/admin/actions/applications";
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
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const totalCount = applications.length;
  const pendingCount = applications.filter((record) => record.status === "pending").length;
  const approvedCount = applications.filter((record) => record.status === "approved").length;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return applications.filter(
      (record) =>
        (query === "" ||
          `${record.firstName} ${record.lastName}`.toLowerCase().includes(query) ||
          record.ticketNo.toLowerCase().includes(query)) &&
        (serviceId === "all" || record.serviceId === serviceId) &&
        (status === "all" || record.status === status),
    );
  }, [applications, search, serviceId, status]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const reviewing = reviewingId
    ? (applications.find((record) => record.id === reviewingId) ?? null)
    : null;

  const closeReview = () => {
    setReviewingId(null);
    setFormError(null);
  };

  const handleReview = (id: string, values: ApplicationReviewValues) => {
    setFormError(null);
    startTransition(async () => {
      const result = await reviewApplication(id, values);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      closeReview();
      setToast(values.status === "approved" ? "Application approved." : "Application rejected.");
    });
  };

  const handleRelease = (id: string) => {
    setFormError(null);
    startTransition(async () => {
      const result = await releaseApplication(id);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      closeReview();
      setToast("Marked as released.");
    });
  };

  const handleCreate = (values: WalkInApplicationValues) => {
    setFormError(null);
    startTransition(async () => {
      const result = await createWalkInApplication(values);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setCreateOpen(false);
      setPage(1);
      setToast("Walk-in application encoded.");
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
                    <th scope="col" className="px-6 py-4">Applicant</th>
                    <th scope="col" className="px-6 py-4">Document Type</th>
                    <th scope="col" className="px-6 py-4">Date Applied</th>
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
          />
        ) : null}
      </Drawer>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
