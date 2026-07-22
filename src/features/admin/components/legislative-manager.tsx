"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Eye, FileClock, FileText, Pencil, Plus, ScrollText, Trash2 } from "lucide-react";
import type { AdminLegislativeRow } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer } from "@/components/ui/drawer";
import { RowActions, type RowAction } from "@/components/ui/row-actions";
import { SortableTh } from "@/components/ui/sortable-th";
import { Toast } from "@/components/ui/toast";
import { useTableSort } from "@/components/ui/use-table-sort";
import { useToast } from "@/hooks/use-toast";
import { formatDateApproved } from "@/lib/format";
import { fuzzyFilter, haystack } from "@/lib/fuzzy";
import {
  deleteLegislative,
  getLegislativeForEditAction,
  setLegislativeStatus,
} from "@/features/admin/actions/legislative";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
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

/** A row action awaiting confirmation. Null when no dialog is open. */
type PendingAction = {
  kind: "archive" | "delete";
  id: string;
  name: string;
} | null;

/** Ordinance & resolution directory: stat cards, filterable table, drawer editor backed by real actions. */
export function LegislativeManager({ documents }: LegislativeManagerProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<LegislativeEditRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<PendingAction>(null);
  const [actionPending, setActionPending] = useState(false);
  const { toast, showToast, showError, dismissToast } = useToast();
  const [, startTransition] = useTransition();

  const totalOrdinances = documents.filter((r) => r.docType === "ordinance").length;
  const totalResolutions = documents.filter((r) => r.docType === "resolution").length;
  const draftsAndInReview = documents.filter(
    (r) => r.status === "draft" || r.status === "in-review",
  ).length;

  const filtered = useMemo(() => {
    const narrowed = documents.filter(
      (record) =>
        (type === "all" || record.docType === type) &&
        (status === "all" || record.status === status),
    );
    return fuzzyFilter(narrowed, search, (record) => haystack(record.number, record.title));
  }, [documents, search, type, status]);

  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    filtered,
    { key: "date", dir: "desc" },
    {
      number: (r) => r.number,
      title: (r) => r.title,
      date: (r) => r.dateApproved,
      status: (r) => r.status,
    },
  );

  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
          showError("Could not load that document.");
          return;
        }
        setEditing({ id: row.id, values: detail.values, status: detail.status, fileUrl: detail.fileUrl });
        setDrawerOpen(true);
      } finally {
        setLoadingEditId(null);
      }
    });
  };

  /** Run the confirmed row action; the dialog stays locked until it answers. */
  const runConfirmed = () => {
    if (!confirming) return;
    const { kind, id, name } = confirming;
    setActionPending(true);
    startTransition(async () => {
      const result =
        kind === "delete"
          ? await deleteLegislative(id)
          : await setLegislativeStatus(id, "archived");
      setActionPending(false);
      setConfirming(null);
      if (result.error) {
        showError(result.error);
        return;
      }
      showToast(kind === "delete" ? `Deleted ${name}.` : `Archived ${name}.`);
      router.refresh();
    });
  };

  const actionsFor = (record: AdminLegislativeRow): RowAction[] => {
    const actions: RowAction[] = [
      {
        label: record.status === "archived" ? "View details" : "Edit document",
        icon: record.status === "archived" ? Eye : Pencil,
        onSelect: () => openEdit(record),
        disabled: loadingEditId === record.id,
      },
    ];
    if (record.status === "published") {
      actions.push({
        label: "Archive",
        icon: Archive,
        tone: "danger",
        onSelect: () => setConfirming({ kind: "archive", id: record.id, name: record.number }),
      });
    }
    actions.push({
      label: "Delete",
      icon: Trash2,
      tone: "danger",
      onSelect: () => setConfirming({ kind: "delete", id: record.id, name: record.number }),
    });
    return actions;
  };

  const handleSaved = (message: string) => {
    setDrawerOpen(false);
    showToast(message);
    router.refresh();
  };

  const clearFilters = () => {
    setType("all");
    setStatus("all");
    setPage(1);
  };

  return (
    <>
      <div className="mb-6 flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="h-5 w-5" aria-hidden="true" />
          Add New Document
        </Button>
      </div>
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
              search={{
                id: "legislative-search",
                value: search,
                placeholder: "Search number or title...",
                onChange: (value) => {
                  setSearch(value);
                  setPage(1);
                },
              }}
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
                    <SortableTh label="Title / Number" sortKey="title" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <th scope="col" className="px-6 py-4">Type</th>
                    <SortableTh label="Date Approved" sortKey="date" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
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
                      <td className="px-6 py-4 text-ink-600">
                        {formatDateApproved(record.dateApproved)}
                      </td>
                      <td className="px-6 py-4">
                        <StatusChip status={record.status} />
                      </td>
                      <td className="px-6 py-4 text-ink-600">{record.hasFile ? "PDF" : "—"}</td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end">
                          <RowActions label={record.number} actions={actionsFor(record)} />
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
      <ConfirmDialog
        open={confirming !== null}
        title={confirming?.kind === "delete" ? "Delete this document?" : "Archive this document?"}
        body={
          confirming?.kind === "delete" ? (
            <>
              <strong className="font-semibold text-ink-900">{confirming.name}</strong> and its
              uploaded PDF will be removed permanently. This cannot be undone.
            </>
          ) : (
            <>
              <strong className="font-semibold text-ink-900">{confirming?.name}</strong> will be
              removed from the public transparency board. The record is kept and can be
              published again later.
            </>
          )
        }
        confirmLabel={confirming?.kind === "delete" ? "Delete" : "Archive"}
        pending={actionPending}
        onConfirm={runConfirmed}
        onCancel={() => setConfirming(null)}
      />
      {toast ? (
        <Toast key={toast.id} message={toast.message} tone={toast.tone} onDismiss={dismissToast} />
      ) : null}
    </>
  );
}
