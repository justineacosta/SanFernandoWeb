"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, FileClock, FileText, Pencil, Plus, ScrollText } from "lucide-react";
import type { AdminLegislativeRow } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { getLegislativeForEditAction } from "@/features/admin/actions/legislative";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminPagination } from "./admin-pagination";
import { AdminStatCard } from "./admin-stat-card";
import { LegislativeForm, type LegislativeEditRecord } from "./legislative-form";
import { StatusChip } from "./status-chip";

const PAGE_SIZE = 6;

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "in-review", label: "In Review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

interface LegislativeManagerProps {
  documents: AdminLegislativeRow[];
}

/** Ordinance & resolution directory: stat cards, filterable table, drawer editor backed by real actions. */
export function LegislativeManager({ documents }: LegislativeManagerProps) {
  const router = useRouter();
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<LegislativeEditRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const totalOrdinances = documents.filter((r) => r.docType === "ordinance").length;
  const totalResolutions = documents.filter((r) => r.docType === "resolution").length;
  const draftsAndInReview = documents.filter(
    (r) => r.status === "draft" || r.status === "in-review",
  ).length;

  const filtered = useMemo(
    () =>
      documents.filter(
        (record) =>
          (type === "all" || record.docType === type) &&
          (status === "all" || record.status === status),
      ),
    [documents, type, status],
  );

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };

  const openEdit = (row: AdminLegislativeRow) => {
    setLoadingEditId(row.id);
    startTransition(async () => {
      try {
        const detail = await getLegislativeForEditAction(row.id);
        if (!detail) {
          setToast("Could not load that document.");
          return;
        }
        setEditing({ id: row.id, values: detail.values, status: detail.status, fileUrl: detail.fileUrl });
        setDrawerOpen(true);
      } finally {
        setLoadingEditId(null);
      }
    });
  };

  const handleSaved = (message: string) => {
    setDrawerOpen(false);
    setToast(message);
    router.refresh();
  };

  const clearFilters = () => {
    setType("all");
    setStatus("all");
    setPage(1);
  };

  return (
    <>
      <AdminPageHeader
        title="Ordinance & Resolution"
        description="Manage and publish official local laws and policy documents."
        action={
          <Button onClick={openCreate}>
            <Plus className="h-5 w-5" aria-hidden="true" />
            Add New Document
          </Button>
        }
      />
      <div className="mb-6 grid gap-6 sm:grid-cols-3">
        <AdminStatCard icon={FileText} label="Total Ordinances" value={totalOrdinances} />
        <AdminStatCard
          icon={ScrollText}
          label="Total Resolutions"
          value={totalResolutions}
          tone="secondary"
        />
        <AdminStatCard
          icon={FileClock}
          label="Drafts & In Review"
          value={draftsAndInReview}
          tone="danger"
        />
      </div>
      <Card>
        <CardHeader
          title="Document Directory"
          className="mb-0 flex-wrap gap-3 px-6 pt-6"
          action={
            <AdminFilterBar
              selects={[
                {
                  id: "legislative-type-filter",
                  label: "Type",
                  value: type,
                  options: [
                    { value: "all", label: "All Types" },
                    { value: "ordinance", label: "Ordinances" },
                    { value: "resolution", label: "Resolutions" },
                  ],
                  onChange: (value) => {
                    setType(value);
                    setPage(1);
                  },
                },
                {
                  id: "legislative-status-filter",
                  label: "Status",
                  value: status,
                  options: STATUS_OPTIONS,
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
          <AdminEmptyState message="No documents match your filters." onClear={clearFilters} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <th scope="col" className="px-6 py-4">#</th>
                    <th scope="col" className="px-6 py-4">Title / Number</th>
                    <th scope="col" className="px-6 py-4">Type</th>
                    <th scope="col" className="px-6 py-4">Date Approved</th>
                    <th scope="col" className="px-6 py-4">Status</th>
                    <th scope="col" className="px-6 py-4">File</th>
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((record, index) => (
                    <tr key={record.id} className="border-b border-ink-200/40 last:border-b-0">
                      <td className="px-6 py-4 font-semibold text-ink-500">
                        {String((page - 1) * PAGE_SIZE + index + 1).padStart(3, "0")}
                      </td>
                      <td className="max-w-90 px-6 py-4">
                        <p className="font-semibold text-ink-900">{record.title}</p>
                        <p className="truncate text-ink-500">{record.number}</p>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={record.docType === "ordinance" ? "soft" : "neutral"}>
                          {record.docType === "ordinance" ? "Ordinance" : "Resolution"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-ink-600">{formatDate(record.dateApproved)}</td>
                      <td className="px-6 py-4">
                        <StatusChip status={record.status} />
                      </td>
                      <td className="px-6 py-4 text-ink-600">{record.hasFile ? "PDF" : "—"}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(record)}
                          disabled={loadingEditId === record.id}
                          aria-label={`${record.status === "archived" ? "View" : "Edit"} ${record.number}`}
                          className="rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 disabled:opacity-40"
                        >
                          {record.status === "archived" ? (
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          )}
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
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Document" : "Add New Document"}
      >
        {drawerOpen ? (
          <LegislativeForm
            key={editing?.id ?? "new"}
            record={editing}
            onSaved={handleSaved}
            onCancel={() => setDrawerOpen(false)}
          />
        ) : null}
      </Drawer>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
