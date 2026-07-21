"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowDown, ArrowUp, Eye, Pencil, Plus, UserCheck, Users, UserX } from "lucide-react";
import type { AdminOfficialRow } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Toast } from "@/components/ui/toast";
import {
  getOfficialForEditAction,
  reorderOfficials,
} from "@/features/admin/actions/officials";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminStatCard } from "./admin-stat-card";
import { OfficialForm, type OfficialEditRecord } from "./official-form";
import { StatusChip } from "./status-chip";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const GROUP_OPTIONS = [
  { value: "all", label: "All Sections" },
  { value: "executive", label: "Chief Executive" },
  { value: "council", label: "Barangay Council" },
  { value: "administration", label: "Administration" },
];

const GROUP_LABELS: Record<AdminOfficialRow["group"], string> = {
  executive: "Chief Executive",
  council: "Barangay Council",
  administration: "Administration",
};

interface OfficialsManagerProps {
  officials: AdminOfficialRow[];
}

/** Officials directory: stat cards, filters, ordered table, drawer editor. */
export function OfficialsManager({ officials }: OfficialsManagerProps) {
  const router = useRouter();
  const [group, setGroup] = useState("all");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<OfficialEditRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const published = officials.filter((r) => r.status === "published").length;
  const drafts = officials.filter((r) => r.status === "draft" || r.status === "in-review").length;
  const archived = officials.filter((r) => r.status === "archived").length;

  const filtersActive = group !== "all" || status !== "all";

  const filtered = useMemo(
    () =>
      officials.filter(
        (record) =>
          (group === "all" || record.group === group) &&
          (status === "all" || record.status === status),
      ),
    [officials, group, status],
  );

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };

  const openEdit = (row: AdminOfficialRow) => {
    setLoadingEditId(row.id);
    startTransition(async () => {
      try {
        const detail = await getOfficialForEditAction(row.id);
        if (!detail) {
          setToast("Could not load that official.");
          return;
        }
        setEditing({
          id: row.id,
          values: detail.values,
          status: detail.status,
          photoUrl: detail.photoUrl,
        });
        setDrawerOpen(true);
      } finally {
        setLoadingEditId(null);
      }
    });
  };

  /** Swap a row with its neighbour and persist the whole order. */
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= officials.length) return;
    const ids = officials.map((r) => r.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    startTransition(async () => {
      const result = await reorderOfficials(ids);
      if (result.error) {
        setToast(result.error);
        return;
      }
      router.refresh();
    });
  };

  const handleSaved = (message: string) => {
    setDrawerOpen(false);
    setToast(message);
    router.refresh();
  };

  const clearFilters = () => {
    setGroup("all");
    setStatus("all");
  };

  return (
    <>
      <div className="mb-6 flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="h-5 w-5" aria-hidden="true" />
          Add New Official
        </Button>
      </div>
      <div className="mb-6 grid gap-6 sm:grid-cols-3">
        <AdminStatCard icon={UserCheck} label="Published" value={published} />
        <AdminStatCard icon={Users} label="Drafts" value={drafts} tone="secondary" />
        <AdminStatCard icon={UserX} label="Archived" value={archived} tone="danger" />
      </div>
      <Card>
        <CardHeader
          title="Officials Directory"
          className="mb-0 flex-wrap gap-3 px-6 pt-6"
          action={
            <AdminFilterBar
              selects={[
                {
                  id: "official-group-filter",
                  label: "Section",
                  value: group,
                  options: GROUP_OPTIONS,
                  onChange: setGroup,
                },
                {
                  id: "official-status-filter",
                  label: "Status",
                  value: status,
                  options: STATUS_OPTIONS,
                  onChange: setStatus,
                },
              ]}
            />
          }
        />
        {filtered.length === 0 ? (
          <AdminEmptyState message="No officials match your filters." onClear={clearFilters} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 text-left text-sm">
              <thead>
                <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                  <th scope="col" className="px-6 py-4">Order</th>
                  <th scope="col" className="px-6 py-4">Official</th>
                  <th scope="col" className="px-6 py-4">Section</th>
                  <th scope="col" className="px-6 py-4">Status</th>
                  <th scope="col" className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((record) => {
                  // Index in the FULL list — moving must reorder the real
                  // directory, not a filtered view of it.
                  const index = officials.findIndex((r) => r.id === record.id);
                  return (
                    <tr key={record.id} className="border-b border-ink-200/40 last:border-b-0">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <span className="w-6 font-semibold text-ink-500">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          {filtersActive ? null : (
                            <>
                              <button
                                type="button"
                                onClick={() => move(index, -1)}
                                disabled={index === 0}
                                aria-label={`Move ${record.name} up`}
                                className="rounded p-1 text-ink-500 hover:bg-ink-50 hover:text-ink-900 disabled:opacity-30"
                              >
                                <ArrowUp className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => move(index, 1)}
                                disabled={index === officials.length - 1}
                                aria-label={`Move ${record.name} down`}
                                className="rounded p-1 text-ink-500 hover:bg-ink-50 hover:text-ink-900 disabled:opacity-30"
                              >
                                <ArrowDown className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {record.photoUrl ? (
                            <Image
                              src={record.photoUrl}
                              alt=""
                              width={40}
                              height={40}
                              className="h-10 w-10 shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-400">
                              <Users className="h-4 w-4" aria-hidden="true" />
                            </span>
                          )}
                          <div>
                            <p className="font-semibold text-ink-900">{record.name}</p>
                            <p className="text-ink-500">{record.role}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-ink-600">{GROUP_LABELS[record.group]}</td>
                      <td className="px-6 py-4">
                        <StatusChip status={record.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(record)}
                          disabled={loadingEditId === record.id}
                          aria-label={`${record.status === "archived" ? "View" : "Edit"} ${record.name}`}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Official" : "Add New Official"}
      >
        {drawerOpen ? (
          <OfficialForm
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
