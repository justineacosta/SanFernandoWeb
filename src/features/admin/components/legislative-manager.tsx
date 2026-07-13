"use client";

import { useMemo, useState } from "react";
import { Eye, FileClock, FileText, Pencil, Plus, ScrollText } from "lucide-react";
import type { AdminLegislativeRecord } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { ADMIN_LEGISLATIVE } from "@/features/admin/data";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminPagination } from "./admin-pagination";
import { AdminStatCard } from "./admin-stat-card";
import { LegislativeForm } from "./legislative-form";
import { StatusChip } from "./status-chip";

const PAGE_SIZE = 6;

/** Ordinance & resolution directory: stat cards, filterable table, drawer editor (mock). */
export function LegislativeManager() {
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminLegislativeRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Directory numbers stay stable regardless of active filters.
  const indexById = useMemo(
    () => new Map(ADMIN_LEGISLATIVE.map((record, index) => [record.id, index + 1])),
    [],
  );

  const totalOrdinances = ADMIN_LEGISLATIVE.filter((r) => r.type === "ordinance").length;
  const totalResolutions = ADMIN_LEGISLATIVE.filter((r) => r.type === "resolution").length;
  const underReview = ADMIN_LEGISLATIVE.filter((r) => r.status === "under-review").length;

  const filtered = useMemo(
    () =>
      ADMIN_LEGISLATIVE.filter(
        (record) =>
          (type === "all" || record.type === type) &&
          (status === "all" || record.status === status),
      ),
    [type, status],
  );

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (record: AdminLegislativeRecord) => {
    setEditing(record);
    setDrawerOpen(true);
  };
  const handleSaved = () => {
    setDrawerOpen(false);
    setToast("Saved — demo only, backend pending.");
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
        <AdminStatCard icon={FileClock} label="Under Review" value={underReview} tone="danger" />
      </div>
      <Card>
        <CardHeader
          title="Document Directory"
          className="mb-0 px-6 pt-6"
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
                  options: [
                    { value: "all", label: "All Status" },
                    { value: "active", label: "Active" },
                    { value: "under-review", label: "Under Review" },
                    { value: "archived", label: "Archived" },
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
          <AdminEmptyState message="No documents match your filters." onClear={clearFilters} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <th scope="col" className="px-6 py-4">#</th>
                    <th scope="col" className="px-6 py-4">Title / Description</th>
                    <th scope="col" className="px-6 py-4">Type</th>
                    <th scope="col" className="px-6 py-4">Date Passed</th>
                    <th scope="col" className="px-6 py-4">Status</th>
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((record) => (
                    <tr key={record.id} className="border-b border-ink-200/40 last:border-b-0">
                      <td className="px-6 py-4 font-semibold text-ink-500">
                        {String(indexById.get(record.id)).padStart(3, "0")}
                      </td>
                      <td className="max-w-90 px-6 py-4">
                        <p className="font-semibold text-ink-900">{record.document.title}</p>
                        <p className="truncate text-ink-500">{record.document.summary}</p>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={record.type === "ordinance" ? "soft" : "neutral"}>
                          {record.type === "ordinance" ? "Ordinance" : "Resolution"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-ink-600">
                        {record.status === "under-review"
                          ? "Pending"
                          : formatDate(record.document.date)}
                      </td>
                      <td className="px-6 py-4">
                        <StatusChip status={record.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(record)}
                          aria-label={`${record.status === "archived" ? "View" : "Edit"} ${record.document.number}`}
                          className="rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900"
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
