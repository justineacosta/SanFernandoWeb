import Link from "next/link";
import type { AuditActionType, AuditEntry } from "@/types";
import { Card } from "@/components/ui/card";
import { formatAuditTimestamp } from "@/lib/format";
import { searchAuditLog, type AuditSortKey } from "@/features/admin/queries/audit";
import { AdminEmptyState } from "./admin-empty-state";
import { AuditFilters } from "./audit-filters";
import { AUDIT_ACTION_LABELS } from "./audit-action-labels";

/** Tone per action family, so destructive entries are scannable at a glance. */
function toneFor(type: AuditActionType): string {
  if (type === "delete" || type === "reject" || type === "file_delete") {
    return "bg-danger/10 text-danger-deep";
  }
  if (type === "publish" || type === "approve" || type === "restore") {
    return "bg-brand-100 text-brand-800";
  }
  if (type === "role_change" || type === "password_reset") {
    return "bg-ink-900 text-white";
  }
  return "bg-ink-100 text-ink-700";
}

const SORT_COLUMNS: { key: AuditSortKey; label: string }[] = [
  { key: "actor_name", label: "User" },
  { key: "action_type", label: "Action Type" },
  { key: "entity_type", label: "Target Entity" },
  { key: "created_at", label: "Date & Time" },
];

interface Params {
  q: string;
  type: AuditActionType | "all";
  sort: AuditSortKey;
  dir: "asc" | "desc";
  page: number;
}

function hrefFor({ q, type, sort, dir, page }: Params): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (type !== "all") params.set("type", type);
  if (sort !== "created_at") params.set("sort", sort);
  if (dir !== "desc") params.set("dir", dir);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin/audit?${qs}` : "/admin/audit";
}

/** Clicking the active column flips direction; a new column starts descending. */
function sortHrefFor(p: Params, column: AuditSortKey): string {
  const nextDir: "asc" | "desc" = p.sort === column && p.dir === "desc" ? "asc" : "desc";
  return hrefFor({ ...p, sort: column, dir: nextDir, page: 1 });
}

/**
 * Display names for stored `entity_type` slugs. Every other type is already a
 * plain phrase ("news article", "legislative document") that Title Cases
 * cleanly; only the user rows carry a slug. Mapped at render rather than
 * corrected at the source because the table is immutable — historical rows keep
 * whatever string was written, so the fix has to live here to reach them.
 */
const ENTITY_TYPE_LABELS: Record<string, string> = {
  "team-user": "User",
  session: "Session",
  account: "Account",
  profile: "Profile",
};

/**
 * Renders the target as "Official: Maria Santos", falling back through the
 * label captured at write time, then the id (which is a readable ticket number
 * for the four ticket flows), then the bare type.
 */
function targetOf(entry: AuditEntry): string {
  const name = entry.entityLabel?.trim() || entry.entityId?.trim();
  const raw = entry.entityType;
  const type =
    ENTITY_TYPE_LABELS[raw] ?? raw.charAt(0).toUpperCase() + raw.slice(1);
  return name ? `${type}: ${name}` : type;
}

/**
 * Extra context worth showing under the target — staff remarks, permission
 * summaries. Suppressed when it merely repeats the label: migration 0014
 * backfilled `entity_label` from `detail` for historical rows and left `detail`
 * in place, so those rows carry the same string twice. The table is
 * append-only, so this is corrected at render rather than with an UPDATE.
 */
function detailOf(entry: AuditEntry): string | null {
  const detail = entry.detail?.trim();
  if (!detail) return null;
  if (detail === entry.entityLabel?.trim()) return null;
  if (detail === entry.entityId?.trim()) return null;
  return detail;
}

/**
 * Audit Logs table. Server-driven via searchParams rather than a client
 * manager holding the full dataset — this table grows without bound, so the
 * pattern the other eight managers use would eventually ship the entire log
 * to the browser.
 */
export async function AuditLogManager(params: Params) {
  const first = await searchAuditLog(params);
  const lastPage = Math.max(1, Math.ceil(first.total / first.pageSize));
  const safePage = Math.min(Math.max(params.page, 1), lastPage);
  const { entries, total } =
    safePage === params.page ? first : await searchAuditLog({ ...params, page: safePage });
  const current = { ...params, page: safePage };
  const filtered = params.q !== "" || params.type !== "all";

  return (
    <Card className="overflow-hidden">
      <AuditFilters q={params.q} type={params.type} sort={params.sort} dir={params.dir} />

      {entries.length === 0 ? (
        <AdminEmptyState
          message={filtered ? "No audit entries match your filters." : "No activity recorded yet."}
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 text-left text-sm">
              <caption className="sr-only">
                Administrative actions recorded in the barangay portal
              </caption>
              <thead>
                <tr className="border-b border-ink-200/70 bg-ink-50 text-xs font-semibold uppercase tracking-wider text-ink-600">
                  {SORT_COLUMNS.map((column) => {
                    const active = current.sort === column.key;
                    return (
                      // Sort state rides on aria-sort here, as it does in the
                      // shared SortableTh — not an sr-only span. That span was
                      // `absolute` with no positioned ancestor, so on the widest
                      // (rightmost) active column it resolved against <html> and
                      // grew the document past the viewport, panning the page.
                      <th
                        key={column.key}
                        scope="col"
                        aria-sort={
                          active ? (current.dir === "asc" ? "ascending" : "descending") : "none"
                        }
                        className="px-6 py-4"
                      >
                        <Link
                          href={sortHrefFor(current, column.key)}
                          className="inline-flex items-center gap-1 hover:text-ink-900"
                        >
                          {column.label}
                          {active ? (
                            <span aria-hidden="true">{current.dir === "asc" ? "▲" : "▼"}</span>
                          ) : null}
                        </Link>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200/70">
                {entries.map((entry) => (
                  <tr key={entry.id} className="align-top transition-colors hover:bg-ink-50">
                    <td className="px-6 py-4 font-semibold text-ink-900">{entry.actorName}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${toneFor(
                          entry.actionType,
                        )}`}
                      >
                        {AUDIT_ACTION_LABELS[entry.actionType]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-ink-700">
                      {targetOf(entry)}
                      {detailOf(entry) ? (
                        <span className="mt-1 block text-xs text-ink-500">{detailOf(entry)}</span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-ink-600">
                      {formatAuditTimestamp(entry.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col items-center justify-between gap-3 border-t border-ink-200/70 px-6 py-4 sm:flex-row">
            <p className="text-sm text-ink-600">
              Showing{" "}
              <span className="font-semibold text-ink-900">
                {(safePage - 1) * first.pageSize + 1}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-ink-900">
                {Math.min(safePage * first.pageSize, total)}
              </span>{" "}
              of <span className="font-semibold text-ink-900">{total}</span> entries
            </p>
            {lastPage > 1 ? (
              <nav aria-label="Pagination" className="flex items-center gap-4">
                {safePage > 1 ? (
                  <Link
                    href={hrefFor({ ...current, page: safePage - 1 })}
                    className="font-semibold text-ink-900 hover:underline"
                  >
                    ← Previous
                  </Link>
                ) : null}
                <span className="text-sm text-ink-500">
                  Page {safePage} of {lastPage}
                </span>
                {safePage < lastPage ? (
                  <Link
                    href={hrefFor({ ...current, page: safePage + 1 })}
                    className="font-semibold text-ink-900 hover:underline"
                  >
                    Next →
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </div>
        </>
      )}
    </Card>
  );
}
