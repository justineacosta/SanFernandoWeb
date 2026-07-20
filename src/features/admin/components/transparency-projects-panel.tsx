"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import type { AdminTransparencyProjectRow } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Toast } from "@/components/ui/toast";
import {
  deleteTransparencyProject,
  moveTransparencyProject,
  saveTransparencyProject,
  setTransparencyProjectStatus,
} from "@/features/admin/actions/transparency-projects";
import { StatusChip } from "./status-chip";

interface TransparencyProjectsPanelProps {
  projects: AdminTransparencyProjectRow[];
}

/** Monitored-projects editor: name, 0-100 progress, publish/archive, reorder. Modeled on assistance-categories-panel.tsx. */
export function TransparencyProjectsPanel({ projects }: TransparencyProjectsPanelProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editProgress, setEditProgress] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newProgress, setNewProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEdit(project: AdminTransparencyProjectRow) {
    setError(null);
    setEditingId(project.id);
    setEditName(project.name);
    setEditProgress(project.progress);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditProgress(0);
    setError(null);
  }

  function saveEdit(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await saveTransparencyProject(id, { name: editName, progress: editProgress });
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditingId(null);
      setEditName("");
      setEditProgress(0);
      setToast("Project updated.");
      router.refresh();
    });
  }

  function openCreate() {
    setError(null);
    setCreating(true);
    setNewName("");
    setNewProgress(0);
  }

  function cancelCreate() {
    setCreating(false);
    setNewName("");
    setNewProgress(0);
    setError(null);
  }

  function saveCreate() {
    setError(null);
    startTransition(async () => {
      const result = await saveTransparencyProject(null, { name: newName, progress: newProgress });
      if (result.error) {
        setError(result.error);
        return;
      }
      setCreating(false);
      setNewName("");
      setNewProgress(0);
      setToast("Project added.");
      router.refresh();
    });
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
          <Button variant="outline" size="sm" onClick={openCreate} disabled={creating}>
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
              {editingId === project.id ? (
                <div className="flex flex-1 flex-wrap items-center gap-3">
                  <Input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    className="flex-1"
                    autoFocus
                  />
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={editProgress}
                    onChange={(event) => setEditProgress(Number(event.target.value))}
                    className="w-24"
                    aria-label="Progress percent"
                  />
                  <Button size="sm" onClick={() => saveEdit(project.id)} disabled={isPending}>
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={isPending}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{project.name}</p>
                    <p className="text-sm text-ink-500">{project.progress}% complete</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <StatusChip status={project.status} />
                    {project.status === "published" ? (
                      <Button variant="outline-danger" size="sm" onClick={() => setStatus(project, "archived")} disabled={isPending}>
                        Archive
                      </Button>
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
                      disabled={isPending}
                      onClick={() => startEdit(project)}
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
                </>
              )}
            </li>
          ))}
        </ul>
        {creating ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Project name"
              className="flex-1"
              autoFocus
            />
            <Input
              type="number"
              min={0}
              max={100}
              value={newProgress}
              onChange={(event) => setNewProgress(Number(event.target.value))}
              className="w-24"
              aria-label="Progress percent"
              placeholder="0"
            />
            <Button size="sm" onClick={saveCreate} disabled={isPending}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={cancelCreate} disabled={isPending}>
              Cancel
            </Button>
          </div>
        ) : null}
      </Card>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
