"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { Clock, MapPin, Plus } from "lucide-react";
import type { AdminEventRow } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Toast } from "@/components/ui/toast";
import { toCalendarParts } from "@/lib/format";
import { fuzzyFilter, haystack } from "@/lib/fuzzy";
import { EVENT_CATEGORY_LABELS } from "@/features/admin/data";
import { getEventForEditAction } from "@/features/admin/actions/events";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminPagination } from "./admin-pagination";
import { EventForm, type EventEditRecord } from "./event-form";
import { MiniCalendar } from "./mini-calendar";
import { StatusChip } from "./status-chip";

const PAGE_SIZE = 8;

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "in-review", label: "In Review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

interface EventsManagerProps {
  events: AdminEventRow[];
}

/** Event schedule: single DB-backed list, category/status filters, mini calendar, drawer editor. */
export function EventsManager({ events }: EventsManagerProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<EventEditRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const resetPage = () => setPage(1);

  const filtered = useMemo(() => {
    const narrowed = events.filter(
      (record) =>
        (category === "all" || record.category === category) &&
        (status === "all" || record.status === status),
    );
    return fuzzyFilter(narrowed, search, (record) =>
      haystack(record.title, record.venue),
    );
  }, [events, search, category, status]);

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
        setToast("Could not load that event.");
        return;
      }
      setEditing({ id: row.id, values: detail.values, status: detail.status });
      setDrawerOpen(true);
    });
  };

  const handleSaved = (message: string) => {
    setDrawerOpen(false);
    setToast(message);
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
                {
                  id: "event-status-filter",
                  label: "Status",
                  value: status,
                  options: STATUS_OPTIONS,
                  onChange: (value) => {
                    setStatus(value);
                    resetPage();
                  },
                },
              ]}
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
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-200/70 pt-4">
                        <div className="flex flex-wrap items-center gap-4">
                          {record.capacity != null ? (
                            <span className="text-sm text-ink-600">Cap: {record.capacity}</span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => openEdit(record)}
                          disabled={loadingEditId === record.id}
                          className="text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800 disabled:opacity-40"
                        >
                          Manage
                        </button>
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
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
