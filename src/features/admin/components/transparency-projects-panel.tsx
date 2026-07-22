"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ChevronDown, ChevronUp, Pencil, Plus, Send, Trash2 } from "lucide-react";
import type { AdminTransparencyProjectRow } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer } from "@/components/ui/drawer";
import { RowActions, type RowAction } from "@/components/ui/row-actions";
import { Toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { formatOptionalDate } from "@/lib/format";
import { fuzzyFilter } from "@/lib/fuzzy";
import {
  deleteTransparencyProject,
  getTransparencyProjectForEditAction,
  moveTransparencyProject,
  setTransparencyProjectStatus,
} from "@/features/admin/actions/transparency-projects";
import { AdminFilterBar } from "./admin-filter-bar";
import { StatusChip } from "./status-chip";
import { TransparencyProjectForm, type TransparencyProjectEditRecord } from "./transparency-project-form";

interface TransparencyProjectsPanelProps {
  projects: AdminTransparencyProjectRow[];
}

/** Monitored-projects editor: name, progress, date, and files edited in a drawer; reorder/status/delete inline. */
export function TransparencyProjectsPanel({ projects }: TransparencyProjectsPanelProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<TransparencyProjectEditRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<AdminTransparencyProjectRow | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const { toast, showToast, showError, dismissToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const searching = search.trim() !== "";
  const visible = useMemo(
    () => fuzzyFilter(projects, search, (project) => project.name),
    [projects, search],
  );

  function openCreate() {
    setError(null);
    setEditing(null);
    setDrawerOpen(true);
  }

  function openEdit(project: AdminTransparencyProjectRow) {
    setError(null);
    setLoadingId(project.id);
    startTransition(async () => {
      try {
        const detail = await getTransparencyProjectForEditAction(project.id);
        if (!detail) {
          showError("Could not load that project.");
          return;
        }
        setEditing({
          id: project.id,
          values: detail.values,
          status: detail.status,
          files: detail.files,
        });
        setDrawerOpen(true);
      } finally {
        setLoadingId(null);
      }
    });
  }

  function handleSaved(message: string) {
    setDrawerOpen(false);
    showToast(message);
    router.refresh();
  }

  function setStatus(project: AdminTransparencyProjectRow, nextStatus: "published" | "archived") {
    setError(null);
    startTransition(async () => {
      const result = await setTransparencyProjectStatus(project.id, nextStatus);
      if (result.error) {
        showError(result.error);
        return;
      }
      showToast(nextStatus === "published" ? "Project published." : "Project archived.");
      router.refresh();
    });
  }

  function move(id: string, direction: "up" | "down") {
    setError(null);
    startTransition(async () => {
      const result = await moveTransparencyProject(id, direction);
      if (result.error) {
        showError(result.error);
        return;
      }
      showToast("Projects reordered.");
      router.refresh();
    });
  }

  /** Run the confirmed delete; the dialog stays locked until it answers. */
  function runConfirmedDelete() {
    if (!confirming) return;
    const { id, name } = confirming;
    setActionPending(true);
    setError(null);
    startTransition(async () => {
      const result = await deleteTransparencyProject(id);
      setActionPending(false);
      setConfirming(null);
      if (result.error) {
        showError(result.error);
        return;
      }
      showToast(`Deleted ${name}.`);
      router.refresh();
    });
  }

  function actionsFor(project: AdminTransparencyProjectRow): RowAction[] {
    return [
      {
        label: "Edit project",
        icon: Pencil,
        onSelect: () => openEdit(project),
        disabled: isPending || loadingId === project.id,
      },
      project.status === "published"
        ? {
            label: "Archive",
            icon: Archive,
            tone: "danger" as const,
            onSelect: () => setStatus(project, "archived"),
            disabled: isPending,
          }
        : {
            label: "Publish",
            icon: Send,
            onSelect: () => setStatus(project, "published"),
            disabled: isPending,
          },
      {
        label: "Delete",
        icon: Trash2,
        tone: "danger" as const,
        onSelect: () => setConfirming(project),
        disabled: isPending,
      },
    ];
  }

  return (
    <>
      <Card className="p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-semibold tracking-tight text-ink-900">
              Monitored Projects
            </h3>
            <p className="mt-1 text-sm text-ink-600">
              Projects shown on the public transparency page with a live progress bar.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New Project
          </Button>
        </div>
        <AdminFilterBar
          className="mb-4"
          search={{
            id: "transparency-project-search",
            value: search,
            placeholder: "Search projects...",
            onChange: setSearch,
          }}
        />
        {error ? (
          <p role="alert" className="mb-4 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        <ul className="divide-y divide-ink-200/70 rounded-2xl border border-ink-200/70">
          {visible.map((project, index) => (
            <li key={project.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-900">{project.name}</p>
                <p className="text-sm text-ink-500">
                  {project.progress}% complete · {formatOptionalDate(project.date)}
                  {project.fileCount > 0
                    ? ` · ${project.fileCount} file${project.fileCount === 1 ? "" : "s"}`
                    : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <StatusChip status={project.status} />
                {/* Reorder is hidden while searching: "up" means "swap with the
                    row above", and with rows filtered out the row above on
                    screen is not the neighbour the action would move. */}
                {searching ? null : (
                  <>
                    <Tooltip label="Move up">
                      <button
                        type="button"
                        aria-label={`Move ${project.name} up`}
                        disabled={isPending || index === 0}
                        onClick={() => move(project.id, "up")}
                        className="rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 disabled:opacity-40"
                      >
                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </Tooltip>
                    <Tooltip label="Move down">
                      <button
                        type="button"
                        aria-label={`Move ${project.name} down`}
                        disabled={isPending || index === visible.length - 1}
                        onClick={() => move(project.id, "down")}
                        className="rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 disabled:opacity-40"
                      >
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </Tooltip>
                  </>
                )}
                <RowActions label={project.name} actions={actionsFor(project)} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Project" : "New Project"}
      >
        {drawerOpen ? (
          <TransparencyProjectForm
            key={editing?.id ?? "new"}
            record={editing}
            onSaved={handleSaved}
            onCancel={() => setDrawerOpen(false)}
          />
        ) : null}
      </Drawer>
      <ConfirmDialog
        open={confirming !== null}
        title="Delete this project?"
        body={
          <>
            <strong className="font-semibold text-ink-900">{confirming?.name}</strong> and every
            file attached to it will be removed permanently. Archiving hides it from the public
            page while keeping the record — this does not.
          </>
        }
        confirmLabel="Delete"
        pending={actionPending}
        onConfirm={runConfirmedDelete}
        onCancel={() => setConfirming(null)}
      />
      {toast ? (
        <Toast key={toast.id} message={toast.message} tone={toast.tone} onDismiss={dismissToast} />
      ) : null}
    </>
  );
}
