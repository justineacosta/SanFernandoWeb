"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Archive, Clock, Eye, MapPin, Pencil, Plus, RotateCcw, Send, Trash2 } from "lucide-react";
import type { AdminEventRow } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer } from "@/components/ui/drawer";
import { RowActions, type RowAction } from "@/components/ui/row-actions";
import { Toast } from "@/components/ui/toast";
import { ViewToggle, type TableView } from "@/components/ui/view-toggle";
import { useEditDeepLink } from "@/hooks/use-edit-deep-link";
import { useToast } from "@/hooks/use-toast";
import { toCalendarParts } from "@/lib/format";
import { fuzzyFilter, haystack } from "@/lib/fuzzy";
import { EVENT_CATEGORY_LABELS } from "@/features/events/data";
import {
  archiveEvent,
  deleteEvent,
  getEventForEditAction,
  publishEvent,
  restoreEvent,
} from "@/features/admin/actions/events";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminPagination } from "./admin-pagination";
import { ArchivedNote } from "./archived-note";
import { EventForm, type EventEditRecord } from "./event-form";
import { MiniCalendar } from "./mini-calendar";
import { StatusChip } from "./status-chip";

const PAGE_SIZE = 8;

// No "archived" here — archived events live in their own view now, so the
// dropdown only offers states a live record can hold.
const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "in-review", label: "In Review" },
  { value: "published", label: "Published" },
];

/** A row action awaiting confirmation. Null when no dialog is open. */
type PendingAction = { kind: "archive" | "restore" | "delete"; record: AdminEventRow } | null;

interface EventsManagerProps {
  events: AdminEventRow[];
  /**
   * Presentation only — it decides whether Delete is offered on an archived
   * row. `deleteEvent` re-checks with `checkSuperAdmin()`, because a Server
   * Action is a public HTTP endpoint.
   */
  isSuperAdmin: boolean;
}

/** Event schedule: single DB-backed list, category/status filters, mini calendar, drawer editor. */
export function EventsManager({ events, isSuperAdmin }: EventsManagerProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [view, setView] = useState<TableView>("active");
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<EventEditRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<PendingAction>(null);
  const [actionPending, setActionPending] = useState(false);
  const { toast, showToast, showError, dismissToast } = useToast();
  const [, startTransition] = useTransition();

  const resetPage = () => setPage(1);

  const archivedCount = events.filter((record) => record.status === "archived").length;

  const filtered = useMemo(() => {
    const narrowed = events.filter(
      (record) =>
        (record.status === "archived") === (view === "archived") &&
        (category === "all" || record.category === category) &&
        (status === "all" || record.status === status),
    );
    return fuzzyFilter(narrowed, search, (record) =>
      haystack(record.title, record.venue),
    );
  }, [events, view, search, category, status]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };

  const openEdit = (row: AdminEventRow) => {
    setLoadingEditId(row.id);
    startTransition(async () => {
      const detail = await getEventForEditAction(row.id);
      setLoadingEditId(null);
      if (!detail) {
        showError("Could not load that event.");
        return;
      }
      setEditing({ id: row.id, values: detail.values, status: detail.status });
      setDrawerOpen(true);
    });
  };

  // Global-search results link here as /admin/events?edit=<id>.
  useEditDeepLink("edit", (id) => {
    const record = events.find((r) => r.id === id);
    if (record) openEdit(record);
    else showError("That event no longer exists.");
  });

  const handleSaved = (message: string) => {
    setDrawerOpen(false);
    showToast(message);
  };

  const publish = (record: AdminEventRow) => {
    startTransition(async () => {
      const result = await publishEvent(record.id);
      if (result.error) {
        showError(result.error);
        return;
      }
      showToast(`Published ${record.title}.`);
      router.refresh();
    });
  };

  /** Run the confirmed row action; the dialog stays locked until it answers. */
  const runConfirmed = () => {
    if (!confirming) return;
    const { kind, record } = confirming;
    setActionPending(true);
    startTransition(async () => {
      const result =
        kind === "archive"
          ? await archiveEvent(record.id)
          : kind === "restore"
            ? await restoreEvent(record.id)
            : await deleteEvent(record.id);
      setActionPending(false);
      setConfirming(null);
      if (result.error) {
        showError(result.error);
        return;
      }
      showToast(
        kind === "archive"
          ? `Archived ${record.title}.`
          : kind === "restore"
            ? `Restored ${record.title} as a draft.`
            : `Deleted ${record.title}.`,
      );
      router.refresh();
    });
  };

  /**
   * Archiving is how an event leaves the public calendar. Deleting is the
   * SuperAdmin-only escape hatch on an already-archived row (sub-project 7).
   */
  const actionsFor = (record: AdminEventRow): RowAction[] => {
    const archived = record.status === "archived";
    const actions: RowAction[] = [
      {
        label: archived ? "View details" : "Edit event",
        icon: archived ? Eye : Pencil,
        onSelect: () => openEdit(record),
        disabled: loadingEditId === record.id,
      },
    ];
    if (archived) {
      // Restore, not Publish: it comes back as a draft rather than reappearing
      // on the public calendar on one click.
      actions.push({
        label: "Restore",
        icon: RotateCcw,
        onSelect: () => setConfirming({ kind: "restore", record }),
      });
      // Offered to a SuperAdmin only. A disabled item for everyone else would
      // just teach people to click it.
      if (isSuperAdmin) {
        actions.push({
          label: "Delete permanently",
          icon: Trash2,
          tone: "danger",
          onSelect: () => setConfirming({ kind: "delete", record }),
        });
      }
    } else if (record.status === "published") {
      actions.push({
        label: "Archive",
        icon: Archive,
        tone: "danger",
        onSelect: () => setConfirming({ kind: "archive", record }),
      });
    } else {
      actions.push({ label: "Publish", icon: Send, onSelect: () => publish(record) });
    }
    return actions;
  };

  const clearFilters = () => {
    setSearch("");
    setCategory("all");
    setStatus("all");
    setPage(1);
  };

  return (
    <>
      <AdminPageHeader
        title="Event Calendar"
        description="Manage upcoming civic engagements, town halls, and community festivals."
        action={
          <Button onClick={openCreate}>
            <Plus className="h-5 w-5" aria-hidden="true" />
            Create Event
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <Card className="mb-4 p-5">
            <AdminFilterBar
              search={{
                id: "event-search",
                value: search,
                placeholder: "Search events...",
                onChange: (value) => {
                  setSearch(value);
                  resetPage();
                },
              }}
              selects={[
                {
                  id: "event-category-filter",
                  label: "Category",
                  value: category,
                  options: [
                    { value: "all", label: "All Categories" },
                    ...Object.entries(EVENT_CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
                  ],
                  onChange: (value) => {
                    setCategory(value);
                    resetPage();
                  },
                },
                // Every row in the Archived view holds the same status.
                ...(view === "active"
                  ? [
                      {
                        id: "event-status-filter",
                        label: "Status",
                        value: status,
                        options: STATUS_OPTIONS,
                        onChange: (value: string) => {
                          setStatus(value);
                          resetPage();
                        },
                      },
                    ]
                  : []),
              ]}
            />
            <ViewToggle
              className="mt-4"
              view={view}
              archivedCount={archivedCount}
              noun="events"
              onChange={(next) => {
                setView(next);
                setStatus("all");
                resetPage();
              }}
            />
          </Card>
          {filtered.length === 0 ? (
            <Card>
              <AdminEmptyState message="No events match your filters." onClear={clearFilters} />
            </Card>
          ) : (
            <>
              <div className="space-y-4">
                {pageItems.map((record) => {
                  const { month, day } = toCalendarParts(record.eventDate);
                  return (
                    <Card key={record.id} className="p-6">
                      <div className="flex gap-5">
                        <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-brand-100">
                          <p className="text-xs font-bold uppercase text-brand-800">{month}</p>
                          <p className="font-display text-2xl font-bold leading-none text-ink-900">{day}</p>
                        </div>
                        {record.coverSrc ? (
                          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-ink-100">
                            <Image
                              src={record.coverSrc}
                              alt={record.coverAlt}
                              fill
                              sizes="64px"
                              className="object-cover"
                            />
                          </div>
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <div className="mb-1.5 flex flex-wrap items-center gap-2">
                            <Badge variant="neutral">{EVENT_CATEGORY_LABELS[record.category]}</Badge>
                            <StatusChip status={record.status} />
                            <span className="flex items-center gap-1 text-sm text-ink-500">
                              <Clock className="h-4 w-4" aria-hidden="true" />
                              {record.startTime}
                              {record.endTime ? ` - ${record.endTime}` : ""}
                            </span>
                          </div>
                          <h4 className="mb-1 font-display text-lg font-semibold tracking-tight text-ink-900">
                            {record.title}
                          </h4>
                          <p className="flex items-center gap-1 text-sm text-ink-600">
                            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {record.venue}
                          </p>
                          {view === "archived" ? <ArchivedNote {...record} /> : null}
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-200/70 pt-4">
                        <div className="flex flex-wrap items-center gap-4">
                          {record.capacity != null ? (
                            <span className="text-sm text-ink-600">Cap: {record.capacity}</span>
                          ) : null}
                        </div>
                        <RowActions label={record.title} actions={actionsFor(record)} />
                      </div>
                    </Card>
                  );
                })}
              </div>
              <AdminPagination
                page={page}
                pageSize={PAGE_SIZE}
                total={filtered.length}
                onPageChange={setPage}
                className="mt-6"
              />
            </>
          )}
        </div>
        <div className="space-y-6">
          <MiniCalendar eventDates={events.map((record) => record.eventDate)} />
        </div>
      </div>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={editing ? "Edit Event" : "Create Event"}>
        {drawerOpen ? (
          <EventForm
            key={editing?.id ?? "new-event"}
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
            ? "Delete this event?"
            : confirming?.kind === "restore"
              ? "Restore this event?"
              : "Archive this event?"
        }
        body={
          confirming?.kind === "delete" ? (
            <>
              <strong className="font-semibold text-ink-900">{confirming.record.title}</strong>{" "}
              and its cover image will be removed permanently. There is no undo. Archiving keeps
              the record — this does not.
            </>
          ) : confirming?.kind === "restore" ? (
            <>
              <strong className="font-semibold text-ink-900">{confirming.record.title}</strong>{" "}
              comes back as a <strong className="font-semibold text-ink-900">draft</strong>, not
              onto the public calendar. Publish it again when you are ready.
            </>
          ) : (
            <>
              <strong className="font-semibold text-ink-900">{confirming?.record.title}</strong>{" "}
              will be removed from the public calendar. The record is kept and can be published
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
        <Toast key={toast.id} message={toast.message} tone={toast.tone} onDismiss={dismissToast} />
      ) : null}
    </>
  );
}
