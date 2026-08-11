"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus } from "lucide-react";
import type { AssistanceCategoryRow, AssistanceCategoryValues } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Toast } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import {
  createAssistanceCategory,
  moveAssistanceCategory,
  setAssistanceCategoryActive,
  updateAssistanceCategory,
} from "@/features/admin/actions/assistance-categories";
import { ToggleSwitch } from "./toggle-switch";

interface AssistanceCategoriesPanelProps {
  categories: AssistanceCategoryRow[];
}

const emptyEditValues: AssistanceCategoryValues = { label: "", description: "", requirements: [] };

/** One-per-line textarea → text[] field, mirroring splitRequirements in services.ts. */
function splitLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** SuperAdmin editor for the assistance form's category picker. */
export function AssistanceCategoriesPanel({ categories }: AssistanceCategoriesPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<AssistanceCategoryValues>(emptyEditValues);
  const [requirementsBuffer, setRequirementsBuffer] = useState("");
  const [creating, setCreating] = useState(false);
  const [newBuffer, setNewBuffer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { toast, showToast, dismissToast } = useToast();
  const [isPending, startTransition] = useTransition();

  function startEdit(category: AssistanceCategoryRow) {
    setError(null);
    setEditingId(category.id);
    setEditValues({
      label: category.label,
      description: category.description,
      // Never read back out — saveEdit derives requirements from
      // requirementsBuffer instead, so this exists only to satisfy
      // AssistanceCategoryValues' shape.
      requirements: [],
    });
    setRequirementsBuffer(category.requirements.join("\n"));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues(emptyEditValues);
    setRequirementsBuffer("");
    setError(null);
  }

  function saveEdit(id: string) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateAssistanceCategory(id, {
          label: editValues.label,
          description: editValues.description,
          requirements: splitLines(requirementsBuffer),
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        setEditingId(null);
        setEditValues(emptyEditValues);
        setRequirementsBuffer("");
        showToast("Category saved.");
      } catch {
        setError("Something went wrong. Please try again.");
      }
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
      try {
        const result = await createAssistanceCategory({ label: newBuffer });
        if (result.error) {
          setError(result.error);
          return;
        }
        setCreating(false);
        setNewBuffer("");
        showToast("Category added.");
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  function toggleActive(category: AssistanceCategoryRow) {
    setError(null);
    startTransition(async () => {
      try {
        const nextActive = !category.isActive;
        const result = await setAssistanceCategoryActive(category.id, nextActive);
        if (result.error) {
          setError(result.error);
          return;
        }
        showToast(nextActive ? "Category restored." : "Category retired.");
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  function move(id: string, direction: "up" | "down") {
    setError(null);
    startTransition(async () => {
      try {
        const result = await moveAssistanceCategory(id, direction);
        if (result.error) {
          setError(result.error);
          return;
        }
        showToast("Categories reordered.");
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <>
      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
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
          <InlineAlert message={error} onDismiss={() => setError(null)} className="mb-4" />
        ) : null}
        <ul className="divide-y divide-ink-200/70 rounded-2xl border border-ink-200/70">
          {categories.map((category, index) => (
            <li
              key={category.id}
              className={
                editingId === category.id
                  ? "flex flex-col gap-3 p-4"
                  : "flex items-center justify-between gap-4 p-4"
              }
            >
              {editingId === category.id ? (
                <>
                  <Input
                    value={editValues.label}
                    onChange={(event) =>
                      setEditValues((prev) => ({ ...prev, label: event.target.value }))
                    }
                    aria-label="Category name"
                    autoFocus
                  />
                  <Input
                    value={editValues.description}
                    onChange={(event) =>
                      setEditValues((prev) => ({ ...prev, description: event.target.value }))
                    }
                    placeholder="One line shown under the picker (optional)"
                    aria-label="Category description"
                  />
                  <div className="space-y-1">
                    <label
                      htmlFor={`category-requirements-${category.id}`}
                      className="text-sm font-medium text-ink-700"
                    >
                      What to prepare (one per line)
                    </label>
                    <Textarea
                      id={`category-requirements-${category.id}`}
                      value={requirementsBuffer}
                      onChange={(event) => setRequirementsBuffer(event.target.value)}
                      rows={4}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button size="sm" onClick={() => saveEdit(category.id)} disabled={isPending}>
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={isPending}>
                      Cancel
                    </Button>
                  </div>
                </>
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
                      aria-label={`Edit ${category.label}`}
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
      {toast ? (
        <Toast key={toast.id} message={toast.message} tone={toast.tone} onDismiss={dismissToast} />
      ) : null}
    </>
  );
}
