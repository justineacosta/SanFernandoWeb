"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, FolderKanban, Gavel, Pencil, Plus } from "lucide-react";
import type {
  AdminLegislativeRow,
  AdminTransparencyDocumentRow,
  AdminTransparencyProjectRow,
  TransparencyCategoryRow,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getTransparencyDocumentForEditAction } from "@/features/admin/actions/transparency-documents";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminPagination } from "./admin-pagination";
import { LegislativeManager } from "./legislative-manager";
import { StatusChip } from "./status-chip";
import { TransparencyDocumentForm, type TransparencyDocumentEditRecord } from "./transparency-document-form";
import { TransparencyProjectsPanel } from "./transparency-projects-panel";

const PAGE_SIZE = 6;

type Tab = "legislative" | "documents" | "projects";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "in-review", label: "In Review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

interface TransparencyManagerProps {
  legislative: AdminLegislativeRow[];
  documents: AdminTransparencyDocumentRow[];
  projects: AdminTransparencyProjectRow[];
  categories: TransparencyCategoryRow[];
}

/** Tabbed shell for the transparency admin surface: legislative, public documents, and monitored projects. */
export function TransparencyManager({
  legislative,
  documents,
  projects,
  categories,
}: TransparencyManagerProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("legislative");

  // Public-documents tab: owned here since there is no separate manager component.
  const [docCategoryId, setDocCategoryId] = useState("all");
  const [docStatus, setDocStatus] = useState("all");
  const [docPage, setDocPage] = useState(1);
  const [editingDocument, setEditingDocument] = useState<TransparencyDocumentEditRecord | null>(null);
  const [docDrawerOpen, setDocDrawerOpen] = useState(false);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const switchTab = (next: Tab) => {
    setTab(next);
    setDocCategoryId("all");
    setDocStatus("all");
    setDocPage(1);
  };

  const filteredDocuments = useMemo(
    () =>
      documents.filter(
        (record) =>
          (docCategoryId === "all" || record.categoryId === docCategoryId) &&
          (docStatus === "all" || record.status === docStatus),
      ),
    [documents, docCategoryId, docStatus],
  );

  const documentPageItems = filteredDocuments.slice(
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
          setToast("Could not load that document.");
          return;
        }
        setEditingDocument({
          id: row.id,
          values: detail.values,
          status: detail.status,
          fileUrl: detail.fileUrl,
        });
        setDocDrawerOpen(true);
      } finally {
        setLoadingDocId(null);
      }
    });
  };

  const handleDocumentSaved = (message: string) => {
    setDocDrawerOpen(false);
    setToast(message);
    router.refresh();
  };

  const clearDocFilters = () => {
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
      <div
        role="tablist"
        aria-label="Transparency content type"
        className="mb-6 inline-flex rounded-full border border-ink-200/70 bg-white p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "legislative"}
          onClick={() => switchTab("legislative")}
          className={cn(
            "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
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
            "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
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
            "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
            tab === "projects" ? "bg-brand-500 text-ink-900" : "text-ink-600 hover:bg-ink-50",
          )}
        >
          <FolderKanban className="h-4 w-4" aria-hidden="true" />
          Projects
        </button>
      </div>

      {tab === "legislative" ? <LegislativeManager documents={legislative} /> : null}

      {tab === "documents" ? (
        <>
          <AdminPageHeader
            title="Public Documents"
            description="Budgets, reports, and other disclosure documents for the transparency page."
            action={
              <Button onClick={openCreateDocument}>
                <Plus className="h-5 w-5" aria-hidden="true" />
                Add New Document
              </Button>
            }
          />
          <Card>
            <CardHeader
              title="Document Directory"
              className="mb-0 flex-wrap gap-3 px-6 pt-6"
              action={
                <AdminFilterBar
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
                    {
                      id: "transparency-doc-status-filter",
                      label: "Status",
                      value: docStatus,
                      options: STATUS_OPTIONS,
                      onChange: (value) => {
                        setDocStatus(value);
                        setDocPage(1);
                      },
                    },
                  ]}
                />
              }
            />
            {filteredDocuments.length === 0 ? (
              <AdminEmptyState message="No documents match your filters." onClear={clearDocFilters} />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-160 text-left text-sm">
                    <thead>
                      <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                        <th scope="col" className="px-6 py-4">#</th>
                        <th scope="col" className="px-6 py-4">Title</th>
                        <th scope="col" className="px-6 py-4">Category</th>
                        <th scope="col" className="px-6 py-4">Date Released</th>
                        <th scope="col" className="px-6 py-4">Status</th>
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
                          </td>
                          <td className="px-6 py-4 text-ink-600">{record.categoryLabel}</td>
                          <td className="px-6 py-4 text-ink-600">{formatDate(record.dateReleased)}</td>
                          <td className="px-6 py-4">
                            <StatusChip status={record.status} />
                          </td>
                          <td className="px-6 py-4 text-ink-600">{record.hasFile ? "PDF" : "—"}</td>
                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => openEditDocument(record)}
                              disabled={loadingDocId === record.id}
                              aria-label={`Edit ${record.title}`}
                              className="rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 disabled:opacity-40"
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

      {tab === "projects" ? <TransparencyProjectsPanel projects={projects} /> : null}

      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
