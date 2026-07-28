"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Eye,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import type { AdminOfficialRow } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer } from "@/components/ui/drawer";
import { RowActions, type RowAction } from "@/components/ui/row-actions";
import { SortableTh } from "@/components/ui/sortable-th";
import { Toast } from "@/components/ui/toast";
import { ViewToggle, type TableView } from "@/components/ui/view-toggle";
import { Tooltip } from "@/components/ui/tooltip";
import { useTableSort } from "@/components/ui/use-table-sort";
import { useEditDeepLink } from "@/hooks/use-edit-deep-link";
import { useToast } from "@/hooks/use-toast";
import { fuzzyFilter, haystack } from "@/lib/fuzzy";
import {
  deleteOfficial,
  getOfficialForEditAction,
  reorderOfficials,
  restoreOfficial,
  setOfficialStatus,
} from "@/features/admin/actions/officials";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminStatCard } from "./admin-stat-card";
import { ArchivedNote } from "./archived-note";
import { OfficialForm, type OfficialEditRecord } from "./official-form";
import { StatusChip } from "./status-chip";

// No "archived" here — archived officials live in their own view now, so the
// dropdown only offers states a live record can hold.
const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

const GROUP_OPTIONS = [
  { value: "all", label: "All Sections" },
  { value: "executive", label: "Chief Executive" },
  { value: "council", label: "Barangay Council" },
  { value: "administration", label: "Administration" },
  { value: "members", label: "Members" },
];

const GROUP_LABELS: Record<AdminOfficialRow["group"], string> = {
  executive: "Chief Executive",
  council: "Barangay Council",
  administration: "Administration",
  members: "Members",
};

interface OfficialsManagerProps {
  officials: AdminOfficialRow[];
  /**
   * Decides whether Delete is offered in the Archived view. Presentation only —
   * `deleteOfficial` re-checks with `checkSuperAdmin()`, because a Server Action
   * is a public HTTP endpoint and a prop is not a gate.
   */
  isSuperAdmin: boolean;
}

/** A row action awaiting confirmation. Null when no dialog is open. */
type PendingAction = {
  kind: "archive" | "delete" | "restore";
  id: string;
  name: string;
} | null;

/** Officials directory: stat cards, filters, ordered table, drawer editor. */
export function OfficialsManager({ officials, isSuperAdmin }: OfficialsManagerProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [status, setStatus] = useState("all");
  const [view, setView] = useState<TableView>("active");
  const [editing, setEditing] = useState<OfficialEditRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<PendingAction>(null);
  const [actionPending, setActionPending] = useState(false);
  const { toast, showToast, showError, dismissToast } = useToast();
  const [, startTransition] = useTransition();

  const published = officials.filter((r) => r.status === "published").length;
  const drafts = officials.filter((r) => r.status === "draft" || r.status === "in-review").length;
  const archived = officials.filter((r) => r.status === "archived").length;

  const filtersActive = search.trim() !== "" || group !== "all" || status !== "all";

  const filtered = useMemo(() => {
    const narrowed = officials.filter(
      (record) =>
        (record.status === "archived") === (view === "archived") &&
        (group === "all" || record.group === group) &&
        (status === "all" || record.status === status),
    );
    return fuzzyFilter(narrowed, search, (record) => haystack(record.name, record.role));
  }, [officials, view, search, group, status]);

  // `officials` arrives in stored directory order, so a row's index in it IS
  // its order — no separate sortOrder field needed.
  const orderOf = useMemo(
    () => new Map(officials.map((record, index) => [record.id, index])),
    [officials],
  );

  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    filtered,
    { key: "order", dir: "asc" },
    {
      order: (r) => orderOf.get(r.id) ?? 0,
      name: (r) => r.name,
      section: (r) => GROUP_LABELS[r.group],
      status: (r) => r.status,
    },
  );

  /*
   * Reordering is only coherent while the rows on screen are the whole
   * directory in its stored order: "move up" means "swap with the row above",
   * and filtering, sorting by another column, or looking at the Archived view
   * all break that adjacency.
   */
  const reorderable = view === "active" && !filtersActive && sortKey === "order";

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };

  const openEdit = (row: AdminOfficialRow) => {
    setLoadingEditId(row.id);
    startTransition(async () => {
      try {
        const detail = await getOfficialForEditAction(row.id);
        if (!detail) {
          showError("Could not load that official.");
          return;
        }
        setEditing({
          id: row.id,
          values: detail.values,
          status: detail.status,
          photoUrl: detail.photoUrl,
          achievements: detail.achievements,
        });
        setDrawerOpen(true);
      } catch {
        showError("Could not load that official.");
      } finally {
        setLoadingEditId(null);
      }
    });
  };

  // Global-search results link here as /admin/officials?edit=<id>.
  useEditDeepLink("edit", (id) => {
    const record = officials.find((r) => r.id === id);
    if (record) openEdit(record);
    else showError("That official is no longer in the directory.");
  });

  /** Swap a row with its neighbour and persist the whole order. */
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= officials.length) return;
    const ids = officials.map((r) => r.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    startTransition(async () => {
      try {
        const result = await reorderOfficials(ids);
        if (result.error) {
          showError(result.error);
          return;
        }
        router.refresh();
      } catch {
        showError("Something went wrong. Please try again.");
      }
    });
  };

  /**
   * Run the confirmed row action. The dialog stays open and locked until the
   * Server Action answers, so a second click cannot fire a second delete.
   */
  const runConfirmed = () => {
    if (!confirming) return;
    const { kind, id, name } = confirming;
    setActionPending(true);
    startTransition(async () => {
      try {
        const result =
          kind === "delete"
            ? await deleteOfficial(id)
            : kind === "restore"
              ? await restoreOfficial(id)
              : await setOfficialStatus(id, "archived");
        if (result.error) {
          showError(result.error);
          return;
        }
        showToast(
          kind === "delete"
            ? `Deleted ${name}.`
            : kind === "restore"
              ? `Restored ${name} as a draft.`
              : `Archived ${name}.`,
        );
        router.refresh();
      } catch {
        showError("Something went wrong. Please try again.");
      } finally {
        setActionPending(false);
        setConfirming(null);
      }
    });
  };

  /**
   * Publish straight from the row, like News, Events and Projects.
   *
   * The failure path matters more than the success one here: setOfficialStatus
   * refuses to publish an official with no portrait or no portrait alt text,
   * and before this the refusal had nowhere to surface — the drawer rendered it
   * below a long scrolling form. An error toast is the whole point.
   */
  const publish = (id: string, name: string) => {
    startTransition(async () => {
      try {
        const result = await setOfficialStatus(id, "published");
        if (result.error) {
          showError(result.error);
          return;
        }
        showToast(`Published ${name}.`);
        router.refresh();
      } catch {
        showError("Something went wrong. Please try again.");
      }
    });
  };

  const actionsFor = (record: AdminOfficialRow): RowAction[] => {
    const archived = record.status === "archived";
    const actions: RowAction[] = [
      {
        label: archived ? "View details" : "Edit official",
        icon: archived ? Eye : Pencil,
        onSelect: () => openEdit(record),
        disabled: loadingEditId === record.id,
      },
    ];
    if (archived) {
      actions.push({
        label: "Restore",
        icon: RotateCcw,
        onSelect: () => setConfirming({ kind: "restore", id: record.id, name: record.name }),
      });
      // Umbrella §3.2: permanent deletion is SuperAdmin-only, and only from
      // here. A non-SuperAdmin sees no Delete rather than a disabled one —
      // showing a control that can never work teaches people to click it.
      if (isSuperAdmin) {
        actions.push({
          label: "Delete",
          icon: Trash2,
          tone: "danger",
          onSelect: () => setConfirming({ kind: "delete", id: record.id, name: record.name }),
        });
      }
    } else if (record.status === "published") {
      // Archiving is only meaningful for a record the public can currently see.
      actions.push({
        label: "Archive",
        icon: Archive,
        tone: "danger",
        onSelect: () => setConfirming({ kind: "archive", id: record.id, name: record.name }),
      });
    } else {
      actions.push({
        label: "Publish",
        icon: Send,
        onSelect: () => publish(record.id, record.name),
      });
    }
    return actions;
  };

  const handleSaved = (message: string) => {
    setDrawerOpen(false);
    showToast(message);
    router.refresh();
  };

  const clearFilters = () => {
    setGroup("all");
    setStatus("all");
  };

  return (
    <>
      <AdminPageHeader
        title="Manage Officials"
        description="The barangay directory as the public sees it — order, sections, and who is currently published."
        action={
          <Button onClick={openCreate}>
            <Plus className="h-5 w-5" aria-hidden="true" />
            Add New Official
          </Button>
        }
      />
      <div className="mb-6 grid gap-6 sm:grid-cols-3">
        <AdminStatCard icon={UserCheck} label="Published" value={published} />
        <AdminStatCard icon={Users} label="Drafts" value={drafts} tone="secondary" />
        <AdminStatCard icon={UserX} label="Archived" value={archived} tone="danger" />
      </div>
      <Card>
        {/*
          The view toggle sits on its own row under the heading rather than in
          the header's right-hand cluster. In that cluster it shared a wrapping
          flex row with the filter bar, so switching to Archived — which also
          drops the Status select — reflowed the toggle itself. Here it cannot
          move, and because search is the first control in AdminFilterBar,
          losing a trailing select shifts nothing to its left either.
        */}
        <div className="border-b border-ink-200/70 px-6 pb-4 pt-6">
          <CardHeader
            title="Officials Directory"
            className="mb-0 flex-wrap gap-3 border-b-0 pb-0"
            action={
              <AdminFilterBar
                search={{
                  id: "official-search",
                  value: search,
                  placeholder: "Search name or position...",
                  onChange: setSearch,
                }}
                selects={[
                  {
                    id: "official-group-filter",
                    label: "Section",
                    value: group,
                    options: GROUP_OPTIONS,
                    onChange: setGroup,
                  },
                  // Every row in the Archived view holds the same status, so
                  // the dropdown has nothing left to narrow.
                  ...(view === "active"
                    ? [
                        {
                          id: "official-status-filter",
                          label: "Status",
                          value: status,
                          options: STATUS_OPTIONS,
                          onChange: setStatus,
                        },
                      ]
                    : []),
                ]}
              />
            }
          />
          <ViewToggle
            className="mt-4"
            view={view}
            archivedCount={archived}
            noun="officials"
            onChange={(next) => {
              setView(next);
              setStatus("all");
            }}
          />
        </div>
        {filtered.length === 0 ? (
          view === "archived" && archived === 0 ? (
            <AdminEmptyState message="Nothing archived. Archived officials are kept here as term history." />
          ) : officials.length === 0 ? (
            <AdminEmptyState message="No officials yet. Add the first one." />
          ) : (
            <AdminEmptyState message="No officials match your filters." onClear={clearFilters} />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 text-left text-sm">
              <thead>
                <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                  <SortableTh label="Order" sortKey="order" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                  <SortableTh label="Official" sortKey="name" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                  <SortableTh label="Section" sortKey="section" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                  <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                  <th scope="col" className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((record) => {
                  // Index in the FULL list — moving must reorder the real
                  // directory, not a filtered view of it.
                  const index = officials.findIndex((r) => r.id === record.id);
                  return (
                    <tr key={record.id} className="border-b border-ink-200/40 last:border-b-0">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <span className="w-6 font-semibold text-ink-500">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          {reorderable ? (
                            <>
                              <Tooltip label="Move up">
                                <button
                                  type="button"
                                  onClick={() => move(index, -1)}
                                  disabled={index === 0}
                                  aria-label={`Move ${record.name} up`}
                                  className="rounded p-1 text-ink-500 hover:bg-ink-50 hover:text-ink-900 disabled:opacity-30"
                                >
                                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </Tooltip>
                              <Tooltip label="Move down">
                                <button
                                  type="button"
                                  onClick={() => move(index, 1)}
                                  disabled={index === officials.length - 1}
                                  aria-label={`Move ${record.name} down`}
                                  className="rounded p-1 text-ink-500 hover:bg-ink-50 hover:text-ink-900 disabled:opacity-30"
                                >
                                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </Tooltip>
                            </>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {record.photoUrl ? (
                            <Image
                              src={record.photoUrl}
                              alt=""
                              width={40}
                              height={40}
                              className="h-10 w-10 shrink-0 rounded-full object-cover"
                              unoptimized
                            />
                          ) : (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-400">
                              <Users className="h-4 w-4" aria-hidden="true" />
                            </span>
                          )}
                          <div>
                            <p className="font-semibold text-ink-900">{record.name}</p>
                            <p className="text-ink-500">{record.role}</p>
                            {view === "archived" ? <ArchivedNote {...record} /> : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-ink-600">{GROUP_LABELS[record.group]}</td>
                      <td className="px-6 py-4">
                        <StatusChip status={record.status} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end">
                          <RowActions label={record.name} actions={actionsFor(record)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Official" : "Add New Official"}
      >
        {drawerOpen ? (
          <OfficialForm
            key={editing?.id ?? "new"}
            record={editing}
            onSaved={handleSaved}
            onCancel={() => setDrawerOpen(false)}
          />
        ) : null}
      </Drawer>
      <ConfirmDialog
        open={confirming !== null}
        title={
          confirming?.kind === "delete"
            ? "Delete this official?"
            : confirming?.kind === "restore"
              ? "Restore this official?"
              : "Archive this official?"
        }
        body={
          confirming?.kind === "delete" ? (
            <>
              <strong className="font-semibold text-ink-900">{confirming.name}</strong>, their
              portrait, and every achievement photo will be removed permanently. There is no
              undo. Archiving keeps the record as term history — this does not.
            </>
          ) : confirming?.kind === "restore" ? (
            <>
              <strong className="font-semibold text-ink-900">{confirming.name}</strong> comes
              back as a <strong className="font-semibold text-ink-900">draft</strong>, not
              onto the public directory. Publish them again when you are ready.
            </>
          ) : (
            <>
              <strong className="font-semibold text-ink-900">{confirming?.name}</strong> will
              be removed from the public directory. The record is kept and can be published
              again later.
            </>
          )
        }
        confirmLabel={
          confirming?.kind === "delete"
            ? "Delete"
            : confirming?.kind === "restore"
              ? "Restore"
              : "Archive"
        }
        pending={actionPending}
        onConfirm={runConfirmed}
        onCancel={() => setConfirming(null)}
      />
      {toast ? (
        <Toast
          key={toast.id}
          message={toast.message}
          tone={toast.tone}
          onDismiss={dismissToast}
        />
      ) : null}
    </>
  );
}
