"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import type { AdminServiceRecord } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { IconCircle } from "@/components/ui/icon-circle";
import { Toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { ADMIN_SERVICES } from "@/features/admin/data";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminPagination } from "./admin-pagination";
import { ServiceForm } from "./service-form";
import { StatusChip } from "./status-chip";

const PAGE_SIZE = 6;

/** Interactive services table: search, status filter, pagination, drawer editor (mock). */
export function ServicesManager() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminServiceRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ADMIN_SERVICES.filter(
      (record) =>
        (status === "all" || record.status === status) &&
        (q === "" ||
          record.service.title.toLowerCase().includes(q) ||
          record.department.toLowerCase().includes(q)),
    );
  }, [search, status]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (record: AdminServiceRecord) => {
    setEditing(record);
    setDrawerOpen(true);
  };
  const handleSaved = () => {
    setDrawerOpen(false);
    setToast("Saved — demo only, backend pending.");
  };
  const clearFilters = () => {
    setSearch("");
    setStatus("all");
    setPage(1);
  };

  return (
    <>
      <AdminPageHeader
        title="Services Management"
        description="Manage and configure public services available in the portal."
        action={
          <Button onClick={openCreate}>
            <Plus className="h-5 w-5" aria-hidden="true" />
            Add New Service
          </Button>
        }
      />
      <Card>
        <AdminFilterBar
          className="border-b border-ink-200/70 p-5"
          search={{
            value: search,
            placeholder: "Search services...",
            onChange: (value) => {
              setSearch(value);
              setPage(1);
            },
          }}
          selects={[
            {
              id: "service-status-filter",
              label: "Status",
              value: status,
              options: [
                { value: "all", label: "All Statuses" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ],
              onChange: (value) => {
                setStatus(value);
                setPage(1);
              },
            },
          ]}
        />
        {filtered.length === 0 ? (
          <AdminEmptyState message="No services match your filters." onClear={clearFilters} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <th scope="col" className="px-6 py-4">Service Name</th>
                    <th scope="col" className="px-6 py-4">Department</th>
                    <th scope="col" className="px-6 py-4">Last Updated</th>
                    <th scope="col" className="px-6 py-4">Status</th>
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((record) => (
                    <tr key={record.id} className="border-b border-ink-200/40 last:border-b-0">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <IconCircle icon={record.service.icon} tone="primary" size="sm" square />
                          <div>
                            <p className="font-semibold text-ink-900">{record.service.title}</p>
                            <p className="text-ink-500">{record.service.ctaLabel}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-ink-600">{record.department}</td>
                      <td className="px-6 py-4 text-ink-600">{formatDate(record.updatedAt)}</td>
                      <td className="px-6 py-4">
                        <StatusChip status={record.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(record)}
                          aria-label={`Edit ${record.service.title}`}
                          className="rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
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
        title={editing ? "Edit Service" : "Add New Service"}
      >
        {drawerOpen ? (
          <ServiceForm
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
