"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MotionConfig, motion } from "motion/react";
import { MoreVertical } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAnchorRect } from "@/hooks/use-anchor-rect";
import { cn } from "@/lib/utils";
import { POP } from "@/lib/motion";

export interface RowAction {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Destructive items are separated and coloured. */
  tone?: "default" | "danger";
  disabled?: boolean;
}

interface RowActionsProps {
  /** Named in the trigger's accessible label, e.g. "Hon. Juan Dela Cruz". */
  label: string;
  actions: RowAction[];
  className?: string;
}

const MENU_WIDTH = 208; // w-52
const ITEM_HEIGHT = 40;
const MENU_PADDING = 8;
const GAP = 6;

/**
 * The kebab menu that carries Edit / Archive / Delete for a table row.
 *
 * Chosen over always-visible inline icons: Officials rows already hold two
 * reorder arrows, so inline would put five controls in one row and place
 * Delete a couple of pixels from Edit. One trigger keeps the row scannable and
 * puts the destructive action behind a deliberate second step — and it absorbs
 * Restore (sub-project 6) without another redesign.
 *
 * Confirmation is NOT handled here. Selecting an item calls `onSelect` and
 * closes; the manager owns the ConfirmDialog, because it also owns the pending
 * state and the toast that follow.
 */
export function RowActions({ label, actions, className }: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const { rect, measure } = useAnchorRect(
    triggerRef,
    open,
    // Scroll/resize dismisses without stealing focus back — the user is
    // looking elsewhere by then.
    useCallback(() => close(false), [close]),
  );

  const enabled = actions.filter((action) => !action.disabled);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open, close]);

  // Move DOM focus with the roving index so the menu is genuinely keyboard-driven.
  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items?.[activeIndex]?.focus();
  }, [open, activeIndex]);

  const openMenu = (startAt: "first" | "last") => {
    measure();
    setActiveIndex(startAt === "first" ? 0 : Math.max(enabled.length - 1, 0));
    setOpen(true);
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu("last");
    }
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "Tab":
        // Let focus move on naturally, but do not leave an orphaned menu behind.
        close(false);
        break;
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % enabled.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => (i - 1 + enabled.length) % enabled.length);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(enabled.length - 1);
        break;
      default:
        break;
    }
  };

  const select = (action: RowAction) => {
    close();
    action.onSelect();
  };

  let menu: React.ReactNode = null;
  if (open && rect && enabled.length > 0) {
    const height = enabled.length * ITEM_HEIGHT + MENU_PADDING * 2;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flip = spaceBelow < height + GAP && rect.top > height + GAP;
    const top = flip ? rect.top - height - GAP : rect.bottom + GAP;
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));

    menu = createPortal(
      <MotionConfig reducedMotion="user">
        <motion.div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`Actions for ${label}`}
          onKeyDown={handleMenuKeyDown}
          initial={{ opacity: 0, scale: 0.95, y: flip ? 6 : -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={POP}
          style={{
            top,
            left,
            width: MENU_WIDTH,
            transformOrigin: flip ? "bottom right" : "top right",
          }}
          className="fixed z-70 rounded-2xl border border-ink-200/70 bg-white p-2 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.28)]"
        >
          {enabled.map((action, index) => {
            const Icon = action.icon;
            const danger = action.tone === "danger";
            const firstDanger = danger && enabled[index - 1]?.tone !== "danger" && index > 0;
            return (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                tabIndex={index === activeIndex ? 0 : -1}
                onClick={() => select(action)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
                  danger
                    ? "text-danger hover:bg-danger-soft"
                    : "text-ink-700 hover:bg-ink-50 hover:text-ink-900",
                  firstDanger && "mt-2 border-t border-ink-200/70 pt-3",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {action.label}
              </button>
            );
          })}
        </motion.div>
      </MotionConfig>,
      document.body,
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Actions for ${label}`}
        disabled={enabled.length === 0}
        onClick={() => (open ? close() : openMenu("first"))}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          "rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 disabled:opacity-30",
          open && "bg-ink-50 text-ink-900",
          className,
        )}
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      {menu}
    </>
  );
}
