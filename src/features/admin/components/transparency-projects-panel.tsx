"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import type { AdminTransparencyProjectRow } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Toast } from "@/components/ui/toast";
import { formatOptionalDate } from "@/lib/format";
import {
  deleteTransparencyProject,
  getTransparencyProjectForEditAction,
  moveTransparencyProject,
  setTransparencyProjectStatus,
} from "@/features/admin/actions/transparency-projects";
import { StatusChip } from "./status-chip";
import { TransparencyProjectForm, type TransparencyProjectEditRecord } from "./transparency-project-form";

interface TransparencyProjectsPanelProps {
  projects: AdminTransparencyProjectRow[];
}

/** Monitored-projects editor: name, progress, date, and files edited in a drawer; reorder/status/delete inline. */
export function TransparencyProjectsPanel({ projects }: TransparencyProjectsPanelProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<TransparencyProjectEditRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
          setToast("Could not load that project.");
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
    setToast(message);
    router.refresh();
  }

  function setStatus(project: AdminTransparencyProjectRow, nextStatus: "published" | "archived") {
    setError(null);
    startTransition(async () => {
      const result = await setTransparencyProjectStatus(project.id, nextStatus);
      if (result.error) {
        setError(result.error);
        return;
      }
      setToast(nextStatus === "published" ? "Project published." : "Project archived.");
      router.refresh();
    });
  }

  function move(id: string, direction: "up" | "down") {
    setError(null);
    startTransition(async () => {
      const result = await moveTransparencyProject(id, direction);
      if (result.error) {
        setError(result.error);
        return;
      }
      setToast("Projects reordered.");
      router.refresh();
    });
  }

  function remove(project: AdminTransparencyProjectRow) {
    if (!window.confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteTransparencyProject(project.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setToast("Project deleted.");
      router.refresh();
    });
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
        {error ? (
          <p role="alert" className="mb-4 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        <ul className="divide-y divide-ink-200/70 rounded-2xl border border-ink-200/70">
          {projects.map((project, index) => (
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
                {project.status === "published" ? (
                  <button
                    type="button"
                    aria-label={`Archive ${project.name}`}
                    disabled={isPending}
                    onClick={() => setStatus(project, "archived")}
                    className="rounded-full p-2 text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
                  >
                    <Archive className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : (
                  <Button variant="accent" size="sm" onClick={() => setStatus(project, "published")} disabled={isPending}>
                    Publish
                  </Button>
                )}
                <button
                  type="button"
                  aria-label={`Move ${project.name} up`}
                  disabled={isPending || index === 0}
                  onClick={() => move(project.id, "up")}
                  className="rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 disabled:opacity-40"
                >
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${project.name} down`}
                  disabled={isPending || index === projects.length - 1}
                  onClick={() => move(project.id, "down")}
                  className="rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 disabled:opacity-40"
                >
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Edit ${project.name}`}
                  disabled={isPending || loadingId === project.id}
                  onClick={() => openEdit(project)}
                  className="rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 disabled:opacity-40"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${project.name}`}
                  disabled={isPending}
                  onClick={() => remove(project)}
                  className="rounded-full p-2 text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
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
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
