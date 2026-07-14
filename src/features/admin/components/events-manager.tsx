"use client";

import { useMemo, useState } from "react";
import { Clock, HeartHandshake, MapPin, Plus, TrendingUp, Users } from "lucide-react";
import type { AdminEventRecord } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { IconCircle } from "@/components/ui/icon-circle";
import { Toast } from "@/components/ui/toast";
import { toCalendarParts } from "@/lib/format";
import { ADMIN_EVENTS, EVENT_CATEGORY_LABELS } from "@/features/admin/data";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { EventForm } from "./event-form";
import { MiniCalendar } from "./mini-calendar";
import { StatusChip } from "./status-chip";

/** Event schedule with category filter, mini calendar, engagement panel, drawer editor. */
export function EventsManager() {
  const [category, setCategory] = useState("all");
  const [editing, setEditing] = useState<AdminEventRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const filtered = useMemo(
    () => ADMIN_EVENTS.filter((record) => category === "all" || record.category === category),
    [category],
  );

  const totalRegistered = ADMIN_EVENTS.reduce((sum, r) => sum + (r.registered ?? 0), 0);
  const totalCapacity = ADMIN_EVENTS.reduce((sum, r) => sum + (r.capacity ?? 0), 0);
  const fillPct =
    totalCapacity > 0 ? Math.min(100, Math.round((totalRegistered / totalCapacity) * 100)) : 0;

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (record: AdminEventRecord) => {
    setEditing(record);
    setDrawerOpen(true);
  };
  const handleSaved = () => {
    setDrawerOpen(false);
    setToast("Saved — demo only, backend pending.");
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
          <div className="mb-4 flex items-center justify-between gap-4">
            <h3 className="font-display text-lg font-semibold tracking-tight text-ink-900">
              Upcoming Schedule
            </h3>
            <AdminFilterBar
              selects={[
                {
                  id: "event-category-filter",
                  label: "Category",
                  value: category,
                  options: [
                    { value: "all", label: "All Categories" },
                    ...Object.entries(EVENT_CATEGORY_LABELS).map(([value, label]) => ({
                      value,
                      label,
                    })),
                  ],
                  onChange: setCategory,
                },
              ]}
            />
          </div>
          {filtered.length === 0 ? (
            <Card>
              <AdminEmptyState
                message="No events in this category."
                onClear={() => setCategory("all")}
              />
            </Card>
          ) : (
            <div className="space-y-4">
              {filtered.map((record) => {
                const { month, day } = toCalendarParts(record.event.date);
                return (
                  <Card key={record.id} className="p-6">
                    <div className="flex gap-5">
                      <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-brand-100">
                        <p className="text-xs font-bold uppercase text-brand-800">{month}</p>
                        <p className="font-display text-2xl font-bold leading-none text-ink-900">
                          {day}
                        </p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <Badge variant="neutral">
                            {EVENT_CATEGORY_LABELS[record.category]}
                          </Badge>
                          {record.status === "planning" ? (
                            <StatusChip status="planning" />
                          ) : null}
                          <span className="flex items-center gap-1 text-sm text-ink-500">
                            <Clock className="h-4 w-4" aria-hidden="true" />
                            {record.event.time}
                          </span>
                        </div>
                        <h4 className="mb-1 font-display text-lg font-semibold tracking-tight text-ink-900">
                          {record.event.title}
                        </h4>
                        <p className="flex items-center gap-1 text-sm text-ink-600">
                          <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {record.event.venue}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-200/70 pt-4">
                      <div className="flex flex-wrap items-center gap-4">
                        {record.registered != null ? (
                          <span className="flex items-center gap-1.5 text-sm text-ink-600">
                            <Users className="h-4 w-4" aria-hidden="true" />
                            {record.registered} Registered
                          </span>
                        ) : null}
                        {record.capacity != null ? (
                          <span className="text-sm text-ink-600">Cap: {record.capacity}</span>
                        ) : null}
                        {record.volunteers != null ? (
                          <span className="flex items-center gap-1.5 text-sm text-ink-600">
                            <HeartHandshake className="h-4 w-4" aria-hidden="true" />
                            {record.volunteers} Volunteers
                          </span>
                        ) : null}
                        {record.note ? (
                          <span className="text-sm italic text-ink-500">{record.note}</span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => openEdit(record)}
                        className="text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800"
                      >
                        {record.status === "planning" ? "Edit Details" : "Manage"}
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
        <div className="space-y-6">
          <MiniCalendar eventDates={ADMIN_EVENTS.map((record) => record.event.date)} />
          <Card className="p-6">
            <h3 className="mb-4 font-display text-lg font-semibold tracking-tight text-ink-900">
              Engagement Overview
            </h3>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <p className="text-sm text-ink-600">Total Event Registrations (YTD)</p>
              <p className="font-display text-xl font-bold text-brand-700">
                {totalRegistered.toLocaleString("en-PH")}
              </p>
            </div>
            <div className="mb-6 h-2 rounded-full bg-ink-100">
              <div
                className="h-2 rounded-full bg-brand-500"
                style={{ width: `${fillPct}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="flex items-center gap-3">
              <IconCircle icon={TrendingUp} tone="primary" size="sm" />
              <div>
                <p className="text-sm font-semibold text-ink-900">Attendance Rate</p>
                <p className="text-sm text-ink-600">
                  88% <span className="font-medium text-brand-700">+2% from last year</span>
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Event" : "Create Event"}
      >
        {drawerOpen ? (
          <EventForm
            key={editing?.id ?? "new"}
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
