"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, FileText, Plus } from "lucide-react";
import type {
  AdminApplicationRecord,
  ApplicationFormValues,
  ApplicationReviewValues,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import {
  ADMIN_APPLICATIONS,
  ADMIN_USER,
  CERTIFICATE_SERVICES,
  certificateTitle,
} from "@/features/admin/data";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminPagination } from "./admin-pagination";
import { AdminStatCard } from "./admin-stat-card";
import { ApplicationForm } from "./application-form";
import { ApplicationReviewDrawer } from "./application-review-drawer";
import { StatusChip } from "./status-chip";

const PAGE_SIZE = 6;

/** Today's date as a local ISO string (YYYY-MM-DD). */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Certificate application queue: computed stats, filterable table, review + create
 * drawers. Records live in session state only — approvals/rejections and new
 * applications mutate React state and reset on refresh (mock; backend pending).
 */
export function ApplicationsManager() {
  const [records, setRecords] = useState<AdminApplicationRecord[]>(ADMIN_APPLICATIONS);
  const [search, setSearch] = useState("");
  const [serviceId, setServiceId] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const totalCount = records.length;
  const pendingCount = records.filter((record) => record.status === "pending").length;
  const approvedCount = records.filter((record) => record.status === "approved").length;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter(
      (record) =>
        (query === "" ||
          record.applicantName.toLowerCase().includes(query) ||
          record.referenceNo.toLowerCase().includes(query)) &&
        (serviceId === "all" || record.serviceId === serviceId) &&
        (status === "all" || record.status === status),
    );
  }, [records, search, serviceId, status]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const reviewing = reviewingId
    ? (records.find((record) => record.id === reviewingId) ?? null)
    : null;

  const openReview = (record: AdminApplicationRecord) => {
    setReviewingId(record.id);
    setReviewOpen(true);
  };

  const handleReview = (id: string, values: ApplicationReviewValues) => {
    setRecords((prev) =>
      prev.map((record) =>
        record.id === id
          ? {
              ...record,
              status: values.status,
              remarks: values.remarks || undefined,
              reviewedBy: ADMIN_USER.name,
              reviewedAt: todayIso(),
            }
          : record,
      ),
    );
    setReviewOpen(false);
    setToast("Saved — demo only, backend pending.");
  };

  const handleCreate = (values: ApplicationFormValues) => {
    const nextSequence =
      Math.max(...records.map((record) => Number(record.referenceNo.slice(-4)) || 0)) + 1;
    const sequence = String(nextSequence).padStart(4, "0");
    const record: AdminApplicationRecord = {
      id: `app-${sequence}`,
      referenceNo: `APP-${new Date().getFullYear()}-${sequence}`,
      applicantName: values.applicantName,
      contactNumber: values.contactNumber,
      email: values.email?.trim() ? values.email.trim() : undefined,
      address: values.address,
      serviceId: values.serviceId,
      purpose: values.purpose,
      dateApplied: todayIso(),
      status: "pending",
    };
    setRecords((prev) => [record, ...prev]);
    setCreateOpen(false);
    setPage(1);
    setToast("Saved — demo only, backend pending.");
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
          <Button onClick={() => setCreateOpen(true)}>
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
          label="Approved"
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
                placeholder: "Search applicant name…",
                onChange: (value) => {
                  setSearch(value);
                  setPage(1);
                },
              }}
              selects={[
                {
                  id: "application-service-filter",
                  label: "Certificate type",
                  value: serviceId,
                  options: [
                    { value: "all", label: "All Certificate Types" },
                    ...CERTIFICATE_SERVICES.map((service) => ({
                      value: service.id,
                      label: service.title,
                    })),
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
          <AdminEmptyState message="No applications match your filters." onClear={clearFilters} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <th scope="col" className="px-6 py-4">Applicant</th>
                    <th scope="col" className="px-6 py-4">Certificate Type</th>
                    <th scope="col" className="px-6 py-4">Date Applied</th>
                    <th scope="col" className="px-6 py-4">Status</th>
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((record) => (
                    <tr key={record.id} className="border-b border-ink-200/40 last:border-b-0">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-ink-900">{record.applicantName}</p>
                        <p className="text-xs text-ink-500">{record.referenceNo}</p>
                      </td>
                      <td className="px-6 py-4 text-ink-600">
                        {certificateTitle(record.serviceId)}
                      </td>
                      <td className="px-6 py-4 text-ink-600">{formatDate(record.dateApplied)}</td>
                      <td className="px-6 py-4">
                        <StatusChip status={record.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openReview(record)}
                          aria-label={`Review ${record.referenceNo}`}
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
      <Drawer
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Application Details"
      >
        {reviewOpen && reviewing ? (
          <ApplicationReviewDrawer
            key={reviewing.id}
            record={reviewing}
            onReview={handleReview}
            onCancel={() => setReviewOpen(false)}
          />
        ) : null}
      </Drawer>
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="New Application">
        {createOpen ? (
          <ApplicationForm onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} />
        ) : null}
      </Drawer>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
