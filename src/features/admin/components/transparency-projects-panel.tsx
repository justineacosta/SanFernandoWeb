"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Eye,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react";
import type { AdminTransparencyProjectRow } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer } from "@/components/ui/drawer";
import { RowActions, type RowAction } from "@/components/ui/row-actions";
import { Toast } from "@/components/ui/toast";
import { ViewToggle, type TableView } from "@/components/ui/view-toggle";
import { Tooltip } from "@/components/ui/tooltip";
import { useEditDeepLink } from "@/hooks/use-edit-deep-link";
import { useToast } from "@/hooks/use-toast";
import { formatOptionalDate } from "@/lib/format";
import { fuzzyFilter } from "@/lib/fuzzy";
import {
  deleteTransparencyProject,
  getTransparencyProjectForEditAction,
  moveTransparencyProject,
  restoreTransparencyProject,
  setTransparencyProjectStatus,
} from "@/features/admin/actions/transparency-projects";
import { AdminFilterBar } from "./admin-filter-bar";
import { StatusChip } from "./status-chip";
import { TransparencyProjectForm, type TransparencyProjectEditRecord } from "./transparency-project-form";

interface TransparencyProjectsPanelProps {
  projects: AdminTransparencyProjectRow[];
  /**
   * Decides whether Delete is offered in the Archived view. Presentation only —
   * `deleteTransparencyProject` re-checks with `checkSuperAdmin()`.
   */
  isSuperAdmin: boolean;
}

/** A row action awaiting confirmation. Null when no dialog is open. */
type PendingAction = {
  kind: "delete" | "restore";
  project: AdminTransparencyProjectRow;
} | null;

/** Monitored-projects editor: name, progress, date, and files edited in a drawer; reorder/status/delete inline. */
export function TransparencyProjectsPanel({
  projects,
  isSuperAdmin,
}: TransparencyProjectsPanelProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<TableView>("active");
  const [editing, setEditing] = useState<TransparencyProjectEditRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<PendingAction>(null);
  const [actionPending, setActionPending] = useState(false);
  const { toast, showToast, showError, dismissToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const searching = search.trim() !== "";
  const archivedCount = projects.filter((p) => p.status === "archived").length;
  const visible = useMemo(
    () =>
      fuzzyFilter(
        projects.filter((p) => (p.status === "archived") === (view === "archived")),
        search,
        (project) => project.name,
      ),
    [projects, view, search],
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

  // Only mounted while the Projects tab is showing, so it is safe for this
  // panel to consume ?edit= unconditionally.
  useEditDeepLink("edit", (id) => {
    const project = projects.find((p) => p.id === id);
    if (project) openEdit(project);
    else showError("That project no longer exists.");
  });

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

  /** Run the confirmed row action; the dialog stays locked until it answers. */
  function runConfirmed() {
    if (!confirming) return;
    const { kind, project } = confirming;
    setActionPending(true);
    setError(null);
    startTransition(async () => {
      const result =
        kind === "delete"
          ? await deleteTransparencyProject(project.id)
          : await restoreTransparencyProject(project.id);
      setActionPending(false);
      setConfirming(null);
      if (result.error) {
        showError(result.error);
        return;
      }
      showToast(
        kind === "delete" ? `Deleted ${project.name}.` : `Restored ${project.name} as a draft.`,
      );
      router.refresh();
    });
  }

  function actionsFor(project: AdminTransparencyProjectRow): RowAction[] {
    const archived = project.status === "archived";
    const actions: RowAction[] = [
      {
        label: archived ? "View details" : "Edit project",
        icon: archived ? Eye : Pencil,
        onSelect: () => openEdit(project),
        disabled: isPending || loadingId === project.id,
      },
    ];
    if (archived) {
      // Restore, not Publish: an archived project comes back as a draft so it
      // does not reappear on the public page on one click.
      actions.push({
        label: "Restore",
        icon: RotateCcw,
        onSelect: () => setConfirming({ kind: "restore", project }),
        disabled: isPending,
      });
      // Umbrella §3.2: SuperAdmin only, and only from here.
      if (isSuperAdmin) {
        actions.push({
          label: "Delete",
          icon: Trash2,
          tone: "danger",
          onSelect: () => setConfirming({ kind: "delete", project }),
          disabled: isPending,
        });
      }
    } else if (project.status === "published") {
      actions.push({
        label: "Archive",
        icon: Archive,
        tone: "danger",
        onSelect: () => setStatus(project, "archived"),
        disabled: isPending,
      });
    } else {
      actions.push({
        label: "Publish",
        icon: Send,
        onSelect: () => setStatus(project, "published"),
        disabled: isPending,
      });
    }
    return actions;
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
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <ViewToggle
            view={view}
            archivedCount={archivedCount}
            noun="projects"
            onChange={setView}
          />
          <AdminFilterBar
            search={{
              id: "transparency-project-search",
              value: search,
              placeholder: "Search projects...",
              onChange: setSearch,
            }}
          />
        </div>
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
                {searching || view === "archived" ? null : (
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
        title={confirming?.kind === "delete" ? "Delete this project?" : "Restore this project?"}
        body={
          confirming?.kind === "delete" ? (
            <>
              <strong className="font-semibold text-ink-900">{confirming.project.name}</strong>{" "}
              and every file attached to it will be removed permanently. There is no undo.
            </>
          ) : (
            <>
              <strong className="font-semibold text-ink-900">{confirming?.project.name}</strong>{" "}
              comes back as a <strong className="font-semibold text-ink-900">draft</strong>, not
              onto the public transparency page. Publish it again when you are ready.
            </>
          )
        }
        confirmLabel={confirming?.kind === "delete" ? "Delete" : "Restore"}
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
