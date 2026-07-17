"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus } from "lucide-react";
import type { AssistanceCategoryRow } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Toast } from "@/components/ui/toast";
import {
  createAssistanceCategory,
  moveAssistanceCategory,
  renameAssistanceCategory,
  setAssistanceCategoryActive,
} from "@/features/admin/actions/assistance-categories";
import { ToggleSwitch } from "./toggle-switch";

interface AssistanceCategoriesPanelProps {
  categories: AssistanceCategoryRow[];
}

/** SuperAdmin editor for the assistance form's category picker. */
export function AssistanceCategoriesPanel({ categories }: AssistanceCategoriesPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState("");
  const [creating, setCreating] = useState(false);
  const [newBuffer, setNewBuffer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEdit(category: AssistanceCategoryRow) {
    setError(null);
    setEditingId(category.id);
    setEditBuffer(category.label);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditBuffer("");
    setError(null);
  }

  function saveEdit(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await renameAssistanceCategory(id, { label: editBuffer });
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditingId(null);
      setEditBuffer("");
      setToast("Category renamed.");
    });
  }

  function openCreate() {
    setError(null);
    setCreating(true);
    setNewBuffer("");
  }

  function cancelCreate() {
    setCreating(false);
    setNewBuffer("");
    setError(null);
  }

  function saveCreate() {
    setError(null);
    startTransition(async () => {
      const result = await createAssistanceCategory({ label: newBuffer });
      if (result.error) {
        setError(result.error);
        return;
      }
      setCreating(false);
      setNewBuffer("");
      setToast("Category added.");
    });
  }

  function toggleActive(category: AssistanceCategoryRow) {
    setError(null);
    startTransition(async () => {
      const nextActive = !category.isActive;
      const result = await setAssistanceCategoryActive(category.id, nextActive);
      if (result.error) {
        setError(result.error);
        return;
      }
      setToast(nextActive ? "Category restored." : "Category retired.");
    });
  }

  function move(id: string, direction: "up" | "down") {
    setError(null);
    startTransition(async () => {
      const result = await moveAssistanceCategory(id, direction);
      if (result.error) {
        setError(result.error);
        return;
      }
      setToast("Categories reordered.");
    });
  }

  return (
    <>
      <Card className="p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-semibold tracking-tight text-ink-900">
              Assistance Categories
            </h3>
            <p className="mt-1 text-sm text-ink-600">
              The list residents pick from when requesting assistance. Retiring a category hides
              it from the form; past requests keep it.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={openCreate} disabled={creating}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New Category
          </Button>
        </div>
        {error ? (
          <p role="alert" className="mb-4 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        <ul className="divide-y divide-ink-200/70 rounded-2xl border border-ink-200/70">
          {categories.map((category, index) => (
            <li key={category.id} className="flex items-center justify-between gap-4 p-4">
              {editingId === category.id ? (
                <div className="flex flex-1 items-center gap-3">
                  <Input
                    value={editBuffer}
                    onChange={(event) => setEditBuffer(event.target.value)}
                    className="flex-1"
                    autoFocus
                  />
                  <Button size="sm" onClick={() => saveEdit(category.id)} disabled={isPending}>
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={isPending}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <p className="min-w-0 truncate text-sm font-semibold text-ink-900">
                    {category.label}
                    {category.isActive ? "" : " · retired"}
                  </p>
                  <div className="flex shrink-0 items-center gap-1">
                    <ToggleSwitch
                      label={`${category.isActive ? "Retire" : "Restore"} ${category.label}`}
                      checked={category.isActive}
                      onChange={() => toggleActive(category)}
                    />
                    <button
                      type="button"
                      aria-label={`Move ${category.label} up`}
                      disabled={isPending || index === 0}
                      onClick={() => move(category.id, "up")}
                      className="rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 disabled:opacity-40"
                    >
                      <ChevronUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${category.label} down`}
                      disabled={isPending || index === categories.length - 1}
                      onClick={() => move(category.id, "down")}
                      className="rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 disabled:opacity-40"
                    >
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Rename ${category.label}`}
                      disabled={isPending}
                      onClick={() => startEdit(category)}
                      className="rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 disabled:opacity-40"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
        {creating ? (
          <div className="mt-4 flex items-center gap-3">
            <Input
              value={newBuffer}
              onChange={(event) => setNewBuffer(event.target.value)}
              placeholder="Category name"
              className="flex-1"
              autoFocus
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
