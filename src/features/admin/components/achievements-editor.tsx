"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { AchievementValues, AdminAchievement } from "@/types";
import { Field, Input, Textarea } from "@/components/ui/form";
import {
  createAchievement,
  deleteAchievement,
  reorderAchievements,
  setAchievementVisibility,
  updateAchievement,
} from "@/features/admin/actions/achievements";
import { AchievementPhotoUploader } from "./achievement-photo-uploader";
import { ToggleSwitch } from "./toggle-switch";

const MAX = 20;

function toValues(achievement: AdminAchievement): AchievementValues {
  return {
    title: achievement.title,
    description: achievement.description,
    dateLabel: achievement.dateLabel,
  };
}

function sameValues(a: AchievementValues, b: AchievementValues): boolean {
  return a.title === b.title && a.description === b.description && a.dateLabel === b.dateLabel;
}

interface AchievementsEditorProps {
  officialId: string;
  achievements: AdminAchievement[];
}

/**
 * The achievements sub-list in the officials drawer. Every change persists
 * immediately rather than waiting for the parent form's Save: photos are real
 * uploads, so an achievement row must exist before its photos can.
 */
export function AchievementsEditor({ officialId, achievements: initial }: AchievementsEditorProps) {
  const [items, setItems] = useState<AdminAchievement[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Last-saved text per achievement, so a blur that changed nothing skips the
  // round trip and a failed save can revert the fields.
  const savedRef = useRef<Record<string, AchievementValues>>(
    Object.fromEntries(initial.map((a) => [a.id, toValues(a)])),
  );

  function setField<K extends keyof AchievementValues>(
    id: string,
    key: K,
    value: AchievementValues[K],
  ) {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, [key]: value } : a)));
  }

  function add() {
    setError(null);
    start(async () => {
      const result = await createAchievement(officialId);
      if (result.error || !result.id) {
        setError(result.error ?? "Could not add the achievement.");
        return;
      }
      const created: AdminAchievement = {
        id: result.id,
        title: "",
        description: "",
        dateLabel: "",
        isVisible: true,
        photos: [],
      };
      savedRef.current[created.id] = toValues(created);
      setItems((prev) => [...prev, created]);
      setFocusId(created.id);
    });
  }

  function saveFields(id: string) {
    const current = items.find((a) => a.id === id);
    if (!current) return;
    const next = toValues(current);
    const previous = savedRef.current[id];
    if (previous && sameValues(previous, next)) return;
    setError(null);
    start(async () => {
      const result = await updateAchievement(id, next);
      if (result.error) {
        setError(result.error);
        if (previous) {
          setItems((prev) => prev.map((a) => (a.id === id ? { ...a, ...previous } : a)));
        }
        return;
      }
      savedRef.current[id] = next;
    });
  }

  function toggleVisible(id: string, isVisible: boolean) {
    const previous = items;
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, isVisible } : a)));
    setError(null);
    start(async () => {
      const result = await setAchievementVisibility(id, isVisible);
      if (result.error) {
        setItems(previous);
        setError(result.error);
      }
    });
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const previous = items;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    setError(null);
    start(async () => {
      const result = await reorderAchievements(
        officialId,
        next.map((a) => a.id),
      );
      if (result.error) {
        setItems(previous);
        setError(result.error);
      }
    });
  }

  function remove(id: string) {
    if (!window.confirm("Delete this achievement? Its photos are deleted too.")) return;
    const previous = items;
    setItems((prev) => prev.filter((a) => a.id !== id));
    setError(null);
    start(async () => {
      const result = await deleteAchievement(id);
      if (result.error) {
        setItems(previous);
        setError(result.error);
      }
    });
  }

  // Enter inside these inputs would submit the surrounding official form and
  // close the drawer.
  const blockEnter = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") event.preventDefault();
  };

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-sm text-ink-500">
          No achievements yet. Add the first one below — it appears on this official&rsquo;s
          profile page.
        </p>
      ) : null}

      <ul className="space-y-3">
        {items.map((achievement, index) => (
          <li
            key={achievement.id}
            className="space-y-3 rounded-2xl border border-ink-200/70 bg-white p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                Achievement {index + 1}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0 || pending}
                  aria-label={`Move achievement ${index + 1} up`}
                  className="rounded p-1 text-ink-500 hover:bg-ink-50 hover:text-ink-900 disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1 || pending}
                  aria-label={`Move achievement ${index + 1} down`}
                  className="rounded p-1 text-ink-500 hover:bg-ink-50 hover:text-ink-900 disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(achievement.id)}
                  disabled={pending}
                  aria-label={`Delete achievement ${index + 1}`}
                  className="rounded p-1 text-danger hover:bg-ink-50 disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <Field label="Title" htmlFor={`achievement-title-${achievement.id}`}>
              <Input
                id={`achievement-title-${achievement.id}`}
                autoFocus={achievement.id === focusId}
                placeholder="e.g. Completed the barangay road concreting project"
                value={achievement.title}
                onChange={(event) => setField(achievement.id, "title", event.target.value)}
                onBlur={() => saveFields(achievement.id)}
                onKeyDown={blockEnter}
              />
            </Field>

            <Field label="Date" htmlFor={`achievement-date-${achievement.id}`}>
              <Input
                id={`achievement-date-${achievement.id}`}
                placeholder="e.g. March 2024"
                value={achievement.dateLabel}
                onChange={(event) => setField(achievement.id, "dateLabel", event.target.value)}
                onBlur={() => saveFields(achievement.id)}
                onKeyDown={blockEnter}
              />
            </Field>

            <Field label="Description" htmlFor={`achievement-description-${achievement.id}`}>
              <Textarea
                id={`achievement-description-${achievement.id}`}
                rows={3}
                value={achievement.description}
                onChange={(event) => setField(achievement.id, "description", event.target.value)}
                onBlur={() => saveFields(achievement.id)}
              />
            </Field>

            <div>
              <p className="mb-1.5 text-sm font-medium text-ink-700">Photos</p>
              <AchievementPhotoUploader
                achievementId={achievement.id}
                photos={achievement.photos}
              />
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-ink-200/70 pt-3">
              <span className="text-sm text-ink-600">
                {achievement.isVisible ? "Shown on the profile page" : "Hidden from the public"}
              </span>
              <ToggleSwitch
                label={`Show achievement ${index + 1} publicly`}
                checked={achievement.isVisible}
                onChange={(checked) => toggleVisible(achievement.id, checked)}
              />
            </div>
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={add}
        disabled={pending || items.length >= MAX}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-200 p-3 text-sm font-semibold text-ink-600 hover:border-brand-400 hover:text-brand-700 disabled:opacity-40"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {items.length >= MAX ? `Limit of ${MAX} reached` : "Add achievement"}
      </button>
    </div>
  );
}
