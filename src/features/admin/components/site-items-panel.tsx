"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { AdminSiteItemRow } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer } from "@/components/ui/drawer";
import { IconCircle } from "@/components/ui/icon-circle";
import { RowActions, type RowAction } from "@/components/ui/row-actions";
import { SortableList } from "@/components/ui/sortable-list";
import { Toast } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { resolveIcon } from "@/lib/icon-map";
import { deleteSiteItem, reorderSiteItems } from "@/features/admin/actions/site-content";
import type { SiteBlockSpec } from "@/features/admin/site-blocks";
import { SiteItemForm, type SiteItemEditRecord } from "./site-item-form";

interface SiteItemsPanelProps {
  spec: SiteBlockSpec;
  items: AdminSiteItemRow[];
}

/**
 * One editable collection: a drag-ordered list, a drawer to add or edit, and a
 * confirmed delete.
 *
 * There is no Active | Archived toggle and no status chip, unlike every other
 * manager. Site content has no lifecycle (design §2.3) — an item is on the page
 * or it is gone — so a view switch would offer a place that cannot have
 * anything in it.
 */
export function SiteItemsPanel({ spec, items }: SiteItemsPanelProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<SiteItemEditRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirming, setConfirming] = useState<AdminSiteItemRow | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const { toast, showToast, showError, dismissToast } = useToast();
  const [isPending, startTransition] = useTransition();

  // The dragged row settles into its new place immediately; without this it
  // snaps back to the server order until router.refresh() returns, which reads
  // as the drag having failed.
  const [ordered, setOptimisticOrder] = useOptimistic(items);

  function openCreate() {
    setEditing(null);
    setDrawerOpen(true);
  }

  function openEdit(item: AdminSiteItemRow) {
    setEditing({
      id: item.id,
      values: {
        iconName: item.iconName,
        label: item.label,
        value: item.value,
        body: item.body,
        href: item.href,
        imageAlt: item.imageAlt,
        imageFit: item.imageFit,
      },
      imagePath: item.imagePath,
      imageUrl: item.imageUrl,
    });
    setDrawerOpen(true);
  }

  function handleReorder(orderedIds: string[]) {
    startTransition(async () => {
      try {
        const byId = new Map(items.map((item) => [item.id, item]));
        setOptimisticOrder(orderedIds.map((id) => byId.get(id)!).filter(Boolean));
        const result = await reorderSiteItems(spec.block, orderedIds);
        if (result.error) {
          showError(result.error);
        }
      } catch {
        showError("Something went wrong. Please try again.");
      } finally {
        // Refresh either way: on failure this is what puts the stored order back
        // on screen instead of leaving the optimistic one there.
        router.refresh();
      }
    });
  }

  function runDelete() {
    if (!confirming) return;
    const target = confirming;
    setActionPending(true);
    startTransition(async () => {
      try {
        const result = await deleteSiteItem(target.id);
        if (result.error) {
          showError(result.error);
          return;
        }
        showToast(`Deleted ${describe(target, spec)}.`);
        router.refresh();
      } catch {
        showError("Something went wrong. Please try again.");
      } finally {
        setActionPending(false);
        setConfirming(null);
      }
    });
  }

  function actionsFor(item: AdminSiteItemRow): RowAction[] {
    return [
      {
        label: `Edit ${spec.itemNoun}`,
        icon: Pencil,
        onSelect: () => openEdit(item),
        disabled: isPending,
      },
      {
        label: `Delete ${spec.itemNoun}`,
        icon: Trash2,
        tone: "danger",
        onSelect: () => setConfirming(item),
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
              {spec.title}
            </h3>
            <p className="mt-1 text-sm text-ink-600">{spec.description}</p>
          </div>
          <Button variant="outline" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add {spec.itemNoun}
          </Button>
        </div>

        {ordered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-ink-200 p-6 text-center text-sm text-ink-500">
            Nothing here yet — this section is hidden on the public page until you add{" "}
            {spec.itemNoun === "entry" ? "an" : "a"} {spec.itemNoun}.
          </p>
        ) : (
          <SortableList
            items={ordered}
            getId={(item) => item.id}
            onReorder={handleReorder}
            disabled={isPending}
            noun={spec.noun}
            renderItem={(item) => (
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Preview item={item} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-900">
                      {describe(item, spec)}
                    </p>
                    {item.body ? (
                      <p className="truncate text-sm text-ink-500">{item.body}</p>
                    ) : null}
                  </div>
                </div>
                <RowActions label={describe(item, spec)} actions={actionsFor(item)} />
              </div>
            )}
          />
        )}
      </Card>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={`${editing ? "Edit" : "Add"} ${spec.itemNoun}`}
      >
        {drawerOpen ? (
          <SiteItemForm
            key={editing?.id ?? "new"}
            block={spec.block}
            record={editing}
            onSaved={(message) => {
              setDrawerOpen(false);
              showToast(message);
              router.refresh();
            }}
            onCancel={() => setDrawerOpen(false)}
          />
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={confirming !== null}
        title={`Delete this ${spec.itemNoun}?`}
        body={
          <>
            <strong className="font-semibold text-ink-900">
              {confirming ? describe(confirming, spec) : ""}
            </strong>{" "}
            will be removed from the public page immediately
            {confirming?.imagePath ? ", along with its image" : ""}. There is no undo.
          </>
        }
        confirmLabel="Delete"
        pending={actionPending}
        onConfirm={runDelete}
        onCancel={() => setConfirming(null)}
      />

      {toast ? (
        <Toast key={toast.id} message={toast.message} tone={toast.tone} onDismiss={dismissToast} />
      ) : null}
    </>
  );
}

/** A thumbnail for image blocks, the chosen icon otherwise. */
function Preview({ item }: { item: AdminSiteItemRow }) {
  if (item.imageUrl) {
    return (
      <span className="relative block h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
        <Image src={item.imageUrl} alt="" fill sizes="64px" className="object-cover" />
      </span>
    );
  }
  if (item.iconName) {
    // Handed to IconCircle as a prop rather than rendered as <Icon /> here:
    // react-hooks/static-components rejects a component looked up from a map
    // and then instantiated in the same render (services-manager does the same).
    return <IconCircle icon={resolveIcon(item.iconName)} tone="primary" size="sm" square />;
  }
  return null;
}

/**
 * The best human name for a row. Hero slides have no text at all, so they fall
 * back to their alt text — which is the only thing distinguishing one
 * photograph from another in a list.
 */
function describe(item: AdminSiteItemRow, spec: SiteBlockSpec): string {
  return item.label ?? item.imageAlt ?? `Untitled ${spec.itemNoun}`;
}
