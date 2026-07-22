"use client";

import { useId, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Drag-to-reorder list, used only by the site-content manager (sub-project 9).
 *
 * `BACKEND_HANDOFF` §6.7 records that avoiding a drag-and-drop dependency was a
 * deliberate choice — photo reordering uses up/down buttons, "not an oversight;
 * revisit only if editors ask for it." The owner asked, and umbrella §3.8
 * authorises `@dnd-kit` for the carousel and history timeline. It arrives as
 * this ONE primitive so the dependency stays confined to a single file, and
 * every existing up/down list is left exactly as it is.
 *
 * The keyboard sensor is not optional. Replacing accessible arrow buttons with
 * a mouse-only gesture would be a straight downgrade, so dragging here is
 * operable with Tab to the handle, Space to lift, arrows to move, Space to drop
 * — with dnd-kit's live-region announcements describing each step.
 *
 * Drags are restricted to the vertical axis and the parent element: these are
 * single-column lists, so horizontal freedom only lets an item be dropped
 * somewhere that means nothing.
 */

interface SortableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  /** Receives the full id list in its new order. */
  onReorder: (orderedIds: string[]) => void;
  renderItem: (item: T, index: number) => ReactNode;
  /**
   * Turns dragging off without unmounting the list — used when a save is in
   * flight, so a second reorder cannot race the first.
   */
  disabled?: boolean;
  /** Named in the accessible description, e.g. "carousel slides". */
  noun: string;
  className?: string;
}

export function SortableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  disabled = false,
  noun,
  className,
}: SortableListProps<T>) {
  // dnd-kit derives its `DndDescribedBy-N` aria ids from a module-level
  // counter, so with several lists on one page the server and the client
  // number them differently and React reports a hydration mismatch. A `useId`
  // is stable across both renders; passing it as the context id fixes the
  // numbering at the source.
  const dndId = useId();

  const sensors = useSensors(
    // A small activation distance so a click on a button inside the row is not
    // swallowed as the start of a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = items.map(getId);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder(arrayMove(ids, from, to));
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable: `Press space to start reordering the ${noun}, arrow keys to move, space to drop, escape to cancel.`,
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className={cn("space-y-3", className)}>
          {items.map((item, index) => (
            <SortableRow key={getId(item)} id={getId(item)} disabled={disabled}>
              {renderItem(item, index)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-ink-200/70 bg-white p-4",
        // Lifted rows sit above their neighbours; without the z-index the row
        // being dragged slides underneath the ones it passes.
        isDragging && "relative z-10 shadow-lg",
      )}
    >
      {/*
        Listeners live on the handle, never on the row. A row carries Edit and
        Delete buttons, and a drag listener on the container would make every
        click a potential drag.
      */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        className={cn(
          "mt-1 shrink-0 rounded-lg p-1 text-ink-400 transition-colors",
          disabled ? "cursor-not-allowed opacity-40" : "cursor-grab hover:bg-ink-100 hover:text-ink-700",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
        )}
      >
        <GripVertical className="h-5 w-5" aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}
