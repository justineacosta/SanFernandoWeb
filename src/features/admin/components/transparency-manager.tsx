"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  Eye,
  FileText,
  FolderKanban,
  Gavel,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react";
import type {
  AdminLegislativeRow,
  AdminTransparencyDocumentRow,
  AdminTransparencyProjectRow,
  TransparencyCategoryRow,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer } from "@/components/ui/drawer";
import { RowActions, type RowAction } from "@/components/ui/row-actions";
import { SortableTh } from "@/components/ui/sortable-th";
import { Toast } from "@/components/ui/toast";
import { ViewToggle, type TableView } from "@/components/ui/view-toggle";
import { useTableSort } from "@/components/ui/use-table-sort";
import { useEditDeepLink } from "@/hooks/use-edit-deep-link";
import { useToast } from "@/hooks/use-toast";
import { formatOptionalDate } from "@/lib/format";
import { fuzzyFilter, haystack } from "@/lib/fuzzy";
import { cn } from "@/lib/utils";
import {
  deleteTransparencyDocument,
  getTransparencyDocumentForEditAction,
  restoreTransparencyDocument,
  setTransparencyDocumentStatus,
} from "@/features/admin/actions/transparency-documents";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminPagination } from "./admin-pagination";
import { ArchivedNote } from "./archived-note";
import { LegislativeManager } from "./legislative-manager";
import { StatusChip } from "./status-chip";
import { TransparencyDocumentForm, type TransparencyDocumentEditRecord } from "./transparency-document-form";
import { TransparencyProjectsPanel } from "./transparency-projects-panel";

const PAGE_SIZE = 6;

type Tab = "legislative" | "documents" | "projects";

// No "archived" here — archived documents live in their own view now, so the
// dropdown only offers states a live record can hold.
const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "in-review", label: "In Review" },
  { value: "published", label: "Published" },
];

/** A row action awaiting confirmation. Null when no dialog is open. */
type PendingAction = {
  kind: "archive" | "delete" | "restore";
  id: string;
  name: string;
} | null;

interface TransparencyManagerProps {
  legislative: AdminLegislativeRow[];
  documents: AdminTransparencyDocumentRow[];
  projects: AdminTransparencyProjectRow[];
  categories: TransparencyCategoryRow[];
  /**
   * Decides whether Delete is offered in each panel's Archived view.
   * Presentation only — every delete action re-checks with `checkSuperAdmin()`.
   */
  isSuperAdmin: boolean;
}

/** Tabbed shell for the transparency admin surface: legislative, public documents, and monitored projects. */
export function TransparencyManager({
  legislative,
  documents,
  projects,
  categories,
  isSuperAdmin,
}: TransparencyManagerProps) {
  const router = useRouter();
  // A search hit arrives as ?tab=documents&edit=<id>. Reading the tab in the
  // useState initialiser means the panel that owns the record is the one that
  // mounts, so it — and only it — consumes the `edit` parameter.
  const initialTab = useSearchParams().get("tab");
  const [tab, setTab] = useState<Tab>(
    initialTab === "documents" || initialTab === "projects" ? initialTab : "legislative",
  );

  // Public-documents tab: owned here since there is no separate manager component.
  const [docSearch, setDocSearch] = useState("");
  const [docCategoryId, setDocCategoryId] = useState("all");
  const [docStatus, setDocStatus] = useState("all");
  const [docView, setDocView] = useState<TableView>("active");
  const [docPage, setDocPage] = useState(1);
  const [editingDocument, setEditingDocument] = useState<TransparencyDocumentEditRecord | null>(null);
  const [docDrawerOpen, setDocDrawerOpen] = useState(false);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<PendingAction>(null);
  const [actionPending, setActionPending] = useState(false);
  const { toast, showToast, showError, dismissToast } = useToast();
  const [, startTransition] = useTransition();

  const switchTab = (next: Tab) => {
    setTab(next);
    setDocSearch("");
    setDocCategoryId("all");
    setDocStatus("all");
    setDocView("active");
    setDocPage(1);
  };

  const archivedDocuments = documents.filter((r) => r.status === "archived").length;

  const filteredDocuments = useMemo(() => {
    const narrowed = documents.filter(
      (record) =>
        (record.status === "archived") === (docView === "archived") &&
        (docCategoryId === "all" || record.categoryId === docCategoryId) &&
        (docStatus === "all" || record.status === docStatus),
    );
    return fuzzyFilter(narrowed, docSearch, (record) =>
      haystack(record.title, record.categoryLabel),
    );
  }, [documents, docView, docSearch, docCategoryId, docStatus]);

  const {
    sorted: sortedDocuments,
    sortKey: docSortKey,
    sortDir: docSortDir,
    toggle: toggleDocSort,
  } = useTableSort(
    filteredDocuments,
    { key: "date", dir: "desc" },
    {
      title: (r) => r.title,
      category: (r) => r.categoryLabel,
      date: (r) => r.dateReleased,
      status: (r) => r.status,
    },
  );

  const documentPageItems = sortedDocuments.slice(
    (docPage - 1) * PAGE_SIZE,
    docPage * PAGE_SIZE,
  );

  const openCreateDocument = () => {
    setEditingDocument(null);
    setDocDrawerOpen(true);
  };

  const openEditDocument = (row: AdminTransparencyDocumentRow) => {
    setLoadingDocId(row.id);
    startTransition(async () => {
      try {
        const detail = await getTransparencyDocumentForEditAction(row.id);
        if (!detail) {
          showError("Could not load that document.");
          return;
        }
        setEditingDocument({
          id: row.id,
          values: detail.values,
          status: detail.status,
          files: detail.files,
        });
        setDocDrawerOpen(true);
      } finally {
        setLoadingDocId(null);
      }
    });
  };

  useEditDeepLink(
    "edit",
    (id) => {
      const record = documents.find((r) => r.id === id);
      if (record) openEditDocument(record);
      else showError("That document no longer exists.");
    },
    tab === "documents",
  );

  /** Run the confirmed row action; the dialog stays locked until it answers. */
  const runConfirmed = () => {
    if (!confirming) return;
    const { kind, id, name } = confirming;
    setActionPending(true);
    startTransition(async () => {
      const result =
        kind === "delete"
          ? await deleteTransparencyDocument(id)
          : kind === "restore"
            ? await restoreTransparencyDocument(id)
            : await setTransparencyDocumentStatus(id, "archived");
      setActionPending(false);
      setConfirming(null);
      if (result.error) {
        showError(result.error);
        return;
      }
      showToast(
        kind === "delete"
          ? `Deleted ${name}.`
          : kind === "restore"
            ? `Restored ${name} as a draft.`
            : `Archived ${name}.`,
      );
      router.refresh();
    });
  };

  /** Publish straight from the row, like News, Events, Projects and Officials. */
  const publishDocument = (id: string, name: string) => {
    startTransition(async () => {
      const result = await setTransparencyDocumentStatus(id, "published");
      if (result.error) {
        showError(result.error);
        return;
      }
      showToast(`Published ${name}.`);
      router.refresh();
    });
  };

  const documentActions = (record: AdminTransparencyDocumentRow): RowAction[] => {
    const archived = record.status === "archived";
    const actions: RowAction[] = [
      {
        label: archived ? "View details" : "Edit document",
        icon: archived ? Eye : Pencil,
        onSelect: () => openEditDocument(record),
        disabled: loadingDocId === record.id,
      },
    ];
    if (archived) {
      actions.push({
        label: "Restore",
        icon: RotateCcw,
        onSelect: () => setConfirming({ kind: "restore", id: record.id, name: record.title }),
      });
      // Umbrella §3.2: SuperAdmin only, and only from here.
      if (isSuperAdmin) {
        actions.push({
          label: "Delete",
          icon: Trash2,
          tone: "danger",
          onSelect: () => setConfirming({ kind: "delete", id: record.id, name: record.title }),
        });
      }
    } else if (record.status === "published") {
      actions.push({
        label: "Archive",
        icon: Archive,
        tone: "danger",
        onSelect: () => setConfirming({ kind: "archive", id: record.id, name: record.title }),
      });
    } else {
      // Draft or in-review: publishing is the row's forward action.
      actions.push({
        label: "Publish",
        icon: Send,
        onSelect: () => publishDocument(record.id, record.title),
      });
    }
    return actions;
  };

  const handleDocumentSaved = (message: string) => {
    setDocDrawerOpen(false);
    showToast(message);
    router.refresh();
  };

  const clearDocFilters = () => {
    setDocSearch("");
    setDocCategoryId("all");
    setDocStatus("all");
    setDocPage(1);
  };

  return (
    <>
      <AdminPageHeader
        title="Transparency"
        description="Manage ordinances, resolutions, public documents, and project monitoring."
      />
      {/*
        The three-tab pill is wider than a narrow phone. It scrolls inside its
        own container — like the wide tables do — rather than growing the page:
        the pill keeps its shape and the whole document stops panning sideways.
      */}
      <div className="mb-6 max-w-full overflow-x-auto no-scrollbar">
      <div
        role="tablist"
        aria-label="Transparency content type"
        className="inline-flex rounded-full border border-ink-200/70 bg-white p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "legislative"}
          onClick={() => switchTab("legislative")}
          className={cn(
            "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors",
            tab === "legislative" ? "bg-brand-500 text-ink-900" : "text-ink-600 hover:bg-ink-50",
          )}
        >
          <Gavel className="h-4 w-4" aria-hidden="true" />
          Legislative
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "documents"}
          onClick={() => switchTab("documents")}
          className={cn(
            "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors",
            tab === "documents" ? "bg-brand-500 text-ink-900" : "text-ink-600 hover:bg-ink-50",
          )}
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          Documents
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "projects"}
          onClick={() => switchTab("projects")}
          className={cn(
            "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors",
            tab === "projects" ? "bg-brand-500 text-ink-900" : "text-ink-600 hover:bg-ink-50",
          )}
        >
          <FolderKanban className="h-4 w-4" aria-hidden="true" />
          Projects
        </button>
      </div>
      </div>

      {tab === "legislative" ? (
        <LegislativeManager documents={legislative} isSuperAdmin={isSuperAdmin} />
      ) : null}

      {tab === "documents" ? (
        <>
          <div className="mb-6 flex justify-end">
            <Button onClick={openCreateDocument}>
              <Plus className="h-5 w-5" aria-hidden="true" />
              Add New Document
            </Button>
          </div>
          <Card>
            {/*
              The view toggle sits on its own row under the heading rather than
              in the header's right-hand cluster, where it shared a wrapping
              flex row with the filter bar and moved whenever switching to
              Archived dropped the Status select.
            */}
            <div className="border-b border-ink-200/70 px-6 pb-4 pt-6">
              <CardHeader
                title="Document Directory"
                className="mb-0 flex-wrap gap-3 border-b-0 pb-0"
                action={
                  <AdminFilterBar
                    search={{
                      id: "transparency-doc-search",
                      value: docSearch,
                      placeholder: "Search documents...",
                      onChange: (value) => {
                        setDocSearch(value);
                        setDocPage(1);
                      },
                    }}
                    selects={[
                      {
                        id: "transparency-doc-category-filter",
                        label: "Category",
                        value: docCategoryId,
                        options: [
                          { value: "all", label: "All Categories" },
                          ...categories.map((c) => ({ value: c.id, label: c.label })),
                        ],
                        onChange: (value) => {
                          setDocCategoryId(value);
                          setDocPage(1);
                        },
                      },
                      // Every row in the Archived view holds the same status.
                      ...(docView === "active"
                        ? [
                            {
                              id: "transparency-doc-status-filter",
                              label: "Status",
                              value: docStatus,
                              options: STATUS_OPTIONS,
                              onChange: (value: string) => {
                                setDocStatus(value);
                                setDocPage(1);
                              },
                            },
                          ]
                        : []),
                    ]}
                  />
                }
              />
              <ViewToggle
                className="mt-4"
                view={docView}
                archivedCount={archivedDocuments}
                noun="documents"
                onChange={(next) => {
                  setDocView(next);
                  setDocStatus("all");
                  setDocPage(1);
                }}
              />
            </div>
            {filteredDocuments.length === 0 ? (
              docView === "archived" && archivedDocuments === 0 ? (
                <AdminEmptyState message="Nothing archived. A superseded budget or report is kept here, not deleted." />
              ) : (
                <AdminEmptyState message="No documents match your filters." onClear={clearDocFilters} />
              )
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-160 text-left text-sm">
                    <thead>
                      <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                        <th scope="col" className="px-6 py-4">#</th>
                        <SortableTh label="Title" sortKey="title" activeKey={docSortKey} dir={docSortDir} onToggle={toggleDocSort} />
                        <SortableTh label="Category" sortKey="category" activeKey={docSortKey} dir={docSortDir} onToggle={toggleDocSort} />
                        <SortableTh label="Date Released" sortKey="date" activeKey={docSortKey} dir={docSortDir} onToggle={toggleDocSort} />
                        <SortableTh label="Status" sortKey="status" activeKey={docSortKey} dir={docSortDir} onToggle={toggleDocSort} />
                        <th scope="col" className="px-6 py-4">File</th>
                        <th scope="col" className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documentPageItems.map((record, index) => (
                        <tr key={record.id} className="border-b border-ink-200/40 last:border-b-0">
                          <td className="px-6 py-4 font-semibold text-ink-500">
                            {String((docPage - 1) * PAGE_SIZE + index + 1).padStart(3, "0")}
                          </td>
                          <td className="max-w-90 px-6 py-4">
                            <p className="font-semibold text-ink-900">{record.title}</p>
                            {docView === "archived" ? <ArchivedNote {...record} /> : null}
                          </td>
                          <td className="px-6 py-4 text-ink-600">{record.categoryLabel}</td>
                          <td className="px-6 py-4 text-ink-600">{formatOptionalDate(record.dateReleased)}</td>
                          <td className="px-6 py-4">
                            <StatusChip status={record.status} />
                          </td>
                          <td className="px-6 py-4 text-ink-600">
                            {record.fileCount > 0
                              ? `${record.fileCount} file${record.fileCount === 1 ? "" : "s"}`
                              : "—"}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex justify-end">
                              <RowActions label={record.title} actions={documentActions(record)} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <AdminPagination
                  page={docPage}
                  pageSize={PAGE_SIZE}
                  total={filteredDocuments.length}
                  onPageChange={setDocPage}
                  className="px-6 py-4"
                />
              </>
            )}
          </Card>
          <Drawer
            open={docDrawerOpen}
            onClose={() => setDocDrawerOpen(false)}
            title={editingDocument ? "Edit Document" : "Add New Document"}
          >
            {docDrawerOpen ? (
              <TransparencyDocumentForm
                key={editingDocument?.id ?? "new"}
                record={editingDocument}
                categories={categories}
                onSaved={handleDocumentSaved}
                onCancel={() => setDocDrawerOpen(false)}
              />
            ) : null}
          </Drawer>
        </>
      ) : null}

      {tab === "projects" ? (
        <TransparencyProjectsPanel projects={projects} isSuperAdmin={isSuperAdmin} />
      ) : null}

      <ConfirmDialog
        open={confirming !== null}
        title={
          confirming?.kind === "delete"
            ? "Delete this document?"
            : confirming?.kind === "restore"
              ? "Restore this document?"
              : "Archive this document?"
        }
        body={
          confirming?.kind === "delete" ? (
            <>
              <strong className="font-semibold text-ink-900">{confirming.name}</strong> and every
              file attached to it will be removed permanently. This cannot be undone.
            </>
          ) : confirming?.kind === "restore" ? (
            <>
              <strong className="font-semibold text-ink-900">{confirming.name}</strong> comes
              back as a <strong className="font-semibold text-ink-900">draft</strong>, not onto
              the public transparency board. Publish it again when you are ready.
            </>
          ) : (
            <>
              <strong className="font-semibold text-ink-900">{confirming?.name}</strong> will be
              removed from the public transparency board. The record is kept and can be
              published again later.
            </>
          )
        }
        confirmLabel={
          confirming?.kind === "delete"
            ? "Delete"
            : confirming?.kind === "restore"
              ? "Restore"
              : "Archive"
        }
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
