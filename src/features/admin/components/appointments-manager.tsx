"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarDays, CheckCircle2, ClipboardList, Plus } from "lucide-react";
import type { AppointmentReviewValues, AppointmentRow, WalkInAppointmentValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { SortableTh } from "@/components/ui/sortable-th";
import { Toast } from "@/components/ui/toast";
import { useTableSort } from "@/components/ui/use-table-sort";
import { useEditDeepLink } from "@/hooks/use-edit-deep-link";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { fuzzyFilter, haystack } from "@/lib/fuzzy";
import {
  completeAppointment,
  createWalkInAppointment,
  reviewAppointment,
} from "@/features/admin/actions/appointments";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminPagination } from "./admin-pagination";
import { AdminStatCard } from "./admin-stat-card";
import { AppointmentForm } from "./appointment-form";
import { AppointmentReviewDrawer } from "./appointment-review-drawer";
import { StatusChip } from "./status-chip";

const PAGE_SIZE = 6;

interface AppointmentsManagerProps {
  appointments: AppointmentRow[];
}

/**
 * Appointment queue. Rows come from the server; every action is a
 * Server Action that revalidates the page, so the list refreshes from the DB
 * rather than from local state.
 */
export function AppointmentsManager({ appointments }: AppointmentsManagerProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { toast, showToast, showError, dismissToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const totalCount = appointments.length;
  const pendingCount = appointments.filter((record) => record.status === "pending").length;
  const confirmedCount = appointments.filter((record) => record.status === "confirmed").length;

  const filtered = useMemo(() => {
    const narrowed = appointments.filter(
      (record) => status === "all" || record.status === status,
    );
    return fuzzyFilter(narrowed, search, (record) =>
      haystack(
        record.firstName,
        record.lastName,
        record.ticketNo,
        record.contactNumber,
        record.email,
        record.purpose,
      ),
    );
  }, [appointments, search, status]);

  // Newest first by default — the queue is worked from the top. Schedule sorts
  // by the confirmed date when there is one, otherwise the requested date.
  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    filtered,
    { key: "filed", dir: "desc" },
    {
      resident: (r) => `${r.lastName} ${r.firstName}`,
      schedule: (r) => r.confirmedDate ?? r.preferredDate,
      filed: (r) => r.submittedAt,
      status: (r) => r.status,
    },
  );

  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const reviewing = reviewingId
    ? (appointments.find((record) => record.id === reviewingId) ?? null)
    : null;

  // Global-search results link here as ?review=<id>.
  useEditDeepLink("review", (id) => {
    if (appointments.some((record) => record.id === id)) {
      setFormError(null);
      setReviewingId(id);
    } else {
      showError("That appointment no longer exists.");
    }
  });

  const closeReview = () => {
    setReviewingId(null);
    setFormError(null);
  };

  const handleReview = (id: string, values: AppointmentReviewValues) => {
    setFormError(null);
    startTransition(async () => {
      const result = await reviewAppointment(id, values);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      closeReview();
      showToast(values.status === "confirmed" ? "Appointment confirmed." : "Appointment declined.");
    });
  };

  const handleComplete = (id: string) => {
    setFormError(null);
    startTransition(async () => {
      const result = await completeAppointment(id);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      closeReview();
      showToast("Marked as completed.");
    });
  };

  const handleCreate = (values: WalkInAppointmentValues) => {
    setFormError(null);
    startTransition(async () => {
      const result = await createWalkInAppointment(values);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setCreateOpen(false);
      setPage(1);
      showToast("Walk-in appointment encoded.");
    });
  };

  const clearFilters = () => {
    setSearch("");
    setStatus("all");
    setPage(1);
  };

  return (
    <>
      <AdminPageHeader
        title="Appointments"
        description="Confirm, reschedule or decline resident appointment requests."
        action={
          <Button
            onClick={() => {
              setFormError(null);
              setCreateOpen(true);
            }}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            New Appointment
          </Button>
        }
      />
      <div className="mb-6 grid gap-6 sm:grid-cols-3">
        <AdminStatCard icon={CalendarDays} label="Total Requests" value={totalCount} />
        <AdminStatCard
          icon={ClipboardList}
          label="Awaiting Confirmation"
          value={pendingCount}
          tone={pendingCount > 0 ? "danger" : "secondary"}
        />
        <AdminStatCard
          icon={CheckCircle2}
          label="Confirmed"
          value={confirmedCount}
          tone="secondary"
        />
      </div>
      <Card>
        <CardHeader
          title="Appointment Queue"
          className="mb-0 flex-wrap gap-3 px-6 pt-6"
          action={
            <AdminFilterBar
              search={{
                id: "appointment-search",
                value: search,
                placeholder: "Search name or ticket no…",
                onChange: (value) => {
                  setSearch(value);
                  setPage(1);
                },
              }}
              selects={[
                {
                  id: "appointment-status-filter",
                  label: "Status",
                  value: status,
                  options: [
                    { value: "all", label: "All Statuses" },
                    { value: "pending", label: "Pending" },
                    { value: "confirmed", label: "Confirmed" },
                    { value: "completed", label: "Completed" },
                    { value: "declined", label: "Declined" },
                  ],
                  onChange: (value) => {
                    setStatus(value);
                    setPage(1);
                  },
                },
              ]}
            />
          }
        />
        {filtered.length === 0 ? (
          <AdminEmptyState
            message={
              appointments.length === 0
                ? "No appointment requests yet. Residents' online requests land here."
                : "No appointments match your filters."
            }
            onClear={clearFilters}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <SortableTh label="Resident" sortKey="resident" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Requested Schedule" sortKey="schedule" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Date Filed" sortKey="filed" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((record) => (
                    <tr key={record.id} className="border-b border-ink-200/40 last:border-b-0">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-ink-900">
                          {record.firstName} {record.lastName}
                        </p>
                        <p className="text-xs text-ink-500">
                          {record.ticketNo}
                          {record.source === "walk-in" ? " · walk-in" : ""}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-ink-600">
                        {record.confirmedDate
                          ? `${formatDate(record.confirmedDate)} · ${record.confirmedPeriod === "am" ? "Morning" : "Afternoon"}`
                          : `${formatDate(record.preferredDate)} · ${record.preferredPeriod === "am" ? "Morning" : "Afternoon"} (requested)`}
                      </td>
                      <td className="px-6 py-4 text-ink-600">{formatDate(record.submittedAt)}</td>
                      <td className="px-6 py-4">
                        <StatusChip status={record.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setFormError(null);
                            setReviewingId(record.id);
                          }}
                          aria-label={`Review ${record.ticketNo}`}
                          className="text-sm font-semibold text-brand-700 hover:underline"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AdminPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={filtered.length}
              onPageChange={setPage}
              className="px-6 py-4"
            />
          </>
        )}
      </Card>
      <Drawer open={reviewing !== null} onClose={closeReview} title="Appointment Details">
        {reviewing ? (
          <AppointmentReviewDrawer
            key={reviewing.id}
            record={reviewing}
            onReview={handleReview}
            onComplete={handleComplete}
            onCancel={closeReview}
            saving={isPending}
            error={formError}
          />
        ) : null}
      </Drawer>
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="New Appointment">
        {createOpen ? (
          <AppointmentForm
            onSubmit={handleCreate}
            onCancel={() => setCreateOpen(false)}
            saving={isPending}
            error={formError}
          />
        ) : null}
      </Drawer>
      {toast ? (
        <Toast key={toast.id} message={toast.message} tone={toast.tone} onDismiss={dismissToast} />
      ) : null}
    </>
  );
}
