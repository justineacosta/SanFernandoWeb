"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Pencil, Plus } from "lucide-react";
import type { TransparencyCategoryRow } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Toast } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { ICON_OPTIONS, resolveIcon } from "@/lib/icon-map";
import {
  createTransparencyCategory,
  moveTransparencyCategory,
  renameTransparencyCategory,
  setTransparencyCategoryActive,
} from "@/features/admin/actions/transparency-categories";
import { ToggleSwitch } from "./toggle-switch";

interface TransparencyCategoriesPanelProps {
  categories: TransparencyCategoryRow[];
}

/** SuperAdmin editor for the transparency document form's category picker. Direct port of news-categories-panel.tsx with an icon picker. */
export function TransparencyCategoriesPanel({ categories }: TransparencyCategoriesPanelProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editIcon, setEditIcon] = useState(ICON_OPTIONS[0].value);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newIcon, setNewIcon] = useState(ICON_OPTIONS[0].value);
  const [error, setError] = useState<string | null>(null);
  const { toast, showToast, dismissToast } = useToast();
  const [isPending, startTransition] = useTransition();

  function startEdit(category: TransparencyCategoryRow) {
    setError(null);
    setEditingId(category.id);
    setEditLabel(category.label);
    setEditIcon(category.iconName);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditLabel("");
    setError(null);
  }

  function saveEdit(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await renameTransparencyCategory(id, { label: editLabel, iconName: editIcon });
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditingId(null);
      setEditLabel("");
      showToast("Category renamed.");
      router.refresh();
    });
  }

  function openCreate() {
    setError(null);
    setCreating(true);
    setNewLabel("");
    setNewIcon(ICON_OPTIONS[0].value);
  }

  function cancelCreate() {
    setCreating(false);
    setNewLabel("");
    setError(null);
  }

  function saveCreate() {
    setError(null);
    startTransition(async () => {
      const result = await createTransparencyCategory({ label: newLabel, iconName: newIcon });
      if (result.error) {
        setError(result.error);
        return;
      }
      setCreating(false);
      setNewLabel("");
      showToast("Category added.");
      router.refresh();
    });
  }

  function toggleActive(category: TransparencyCategoryRow) {
    setError(null);
    startTransition(async () => {
      const nextActive = !category.isActive;
      const result = await setTransparencyCategoryActive(category.id, nextActive);
      if (result.error) {
        setError(result.error);
        return;
      }
      showToast(nextActive ? "Category restored." : "Category retired.");
      router.refresh();
    });
  }

  function move(id: string, direction: "up" | "down") {
    setError(null);
    startTransition(async () => {
      const result = await moveTransparencyCategory(id, direction);
      if (result.error) {
        setError(result.error);
        return;
      }
      showToast("Categories reordered.");
      router.refresh();
    });
  }

  return (
    <>
      <Card className="p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-semibold tracking-tight text-ink-900">
              Transparency Categories
            </h3>
            <p className="mt-1 text-sm text-ink-600">
              The list staff pick from when uploading a public document. Retiring a category hides
              it from the form; past documents keep it.
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
          {categories.map((category, index) => {
            const Icon = resolveIcon(category.iconName);
            return (
              <li key={category.id} className="flex items-center justify-between gap-4 p-4">
                {editingId === category.id ? (
                  <div className="flex flex-1 flex-wrap items-center gap-3">
                    <Input
                      value={editLabel}
                      onChange={(event) => setEditLabel(event.target.value)}
                      className="flex-1"
                      autoFocus
                    />
                    <Select
                      value={editIcon}
                      onChange={(event) => setEditIcon(event.target.value)}
                      className="w-auto"
                      aria-label="Icon"
                    >
                      {ICON_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                    <Button size="sm" onClick={() => saveEdit(category.id)} disabled={isPending}>
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={isPending}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex min-w-0 items-center gap-3">
                      <Icon className="h-5 w-5 shrink-0 text-ink-500" aria-hidden="true" />
                      <p className="truncate text-sm font-semibold text-ink-900">
                        {category.label}
                        {category.isActive ? "" : " · retired"}
                      </p>
                    </div>
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
            );
          })}
        </ul>
        {creating ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Input
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              placeholder="Category name"
              className="flex-1"
              autoFocus
            />
            <Select
              value={newIcon}
              onChange={(event) => setNewIcon(event.target.value)}
              className="w-auto"
              aria-label="Icon"
            >
              {ICON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
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
