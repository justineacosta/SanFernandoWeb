"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Eye, ImageIcon, Pencil, Plus } from "lucide-react";
import type { AdminNewsRecord } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Toast } from "@/components/ui/toast";
import { formatCount, formatDate } from "@/lib/format";
import { ADMIN_NEWS } from "@/features/admin/data";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminPagination } from "./admin-pagination";
import { NewsForm } from "./news-form";
import { StatusChip } from "./status-chip";

const PAGE_SIZE = 8;

function metaDate(record: AdminNewsRecord): string {
  if (record.status === "draft") return `Last edited ${formatDate(record.updatedAt)}`;
  if (record.status === "scheduled" && record.scheduledFor)
    return `Scheduled ${formatDate(record.scheduledFor.slice(0, 10))}`;
  return record.article.dateLabel;
}

/** News & announcements card grid: search, category/status/date filters, drawer editor. */
export function NewsManager() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminNewsRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(ADMIN_NEWS.map((record) => record.article.category))),
    [],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ADMIN_NEWS.filter(
      (record) =>
        (category === "all" || record.article.category === category) &&
        (status === "all" || record.status === status) &&
        // Date filter: posts updated on or after the chosen day (ISO strings compare safely).
        (date === "" || record.updatedAt >= date) &&
        (q === "" || record.article.title.toLowerCase().includes(q)),
    );
  }, [search, category, status, date]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resetPage = () => setPage(1);
  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (record: AdminNewsRecord) => {
    setEditing(record);
    setDrawerOpen(true);
  };
  const handleSaved = () => {
    setDrawerOpen(false);
    setToast("Saved — demo only, backend pending.");
  };
  const clearFilters = () => {
    setSearch("");
    setCategory("all");
    setStatus("all");
    setDate("");
    setPage(1);
  };

  return (
    <>
      <AdminPageHeader
        title="News & Announcements"
        description="Manage public updates, advisories, and local news bulletins."
        action={
          <Button onClick={openCreate}>
            <Plus className="h-5 w-5" aria-hidden="true" />
            New Post
          </Button>
        }
      />
      <Card className="mb-6 p-5">
        <AdminFilterBar
          search={{
            value: search,
            placeholder: "Search posts...",
            onChange: (value) => {
              setSearch(value);
              resetPage();
            },
          }}
          selects={[
            {
              id: "news-category-filter",
              label: "Category",
              value: category,
              options: [
                { value: "all", label: "All Categories" },
                ...categories.map((value) => ({ value, label: value })),
              ],
              onChange: (value) => {
                setCategory(value);
                resetPage();
              },
            },
            {
              id: "news-status-filter",
              label: "Status",
              value: status,
              options: [
                { value: "all", label: "All Statuses" },
                { value: "published", label: "Published" },
                { value: "scheduled", label: "Scheduled" },
                { value: "draft", label: "Draft" },
              ],
              onChange: (value) => {
                setStatus(value);
                resetPage();
              },
            },
          ]}
          date={{
            label: "Updated on or after",
            value: date,
            onChange: (value) => {
              setDate(value);
              resetPage();
            },
          }}
        />
      </Card>
      {filtered.length === 0 ? (
        <Card>
          <AdminEmptyState message="No posts match your filters." onClear={clearFilters} />
        </Card>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {pageItems.map((record) => (
              <Card key={record.id} className="flex flex-col overflow-hidden">
                <div className="relative aspect-4/3 bg-ink-100">
                  {record.article.image ? (
                    <Image
                      src={record.article.image}
                      alt={record.article.imageAlt}
                      fill
                      sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-ink-400">
                      <ImageIcon className="h-10 w-10" aria-hidden="true" />
                    </div>
                  )}
                  <StatusChip
                    status={record.status}
                    className="absolute right-3 top-3 shadow-sm"
                  />
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="mb-3 flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold uppercase tracking-wider text-ink-500">
                      {record.article.category}
                    </span>
                    <span className="text-ink-500">{metaDate(record)}</span>
                  </div>
                  <h3 className="mb-2 line-clamp-2 font-display text-lg font-semibold tracking-tight text-ink-900">
                    {record.article.title}
                  </h3>
                  {record.article.excerpt ? (
                    <p className="line-clamp-3 text-sm text-ink-600">{record.article.excerpt}</p>
                  ) : (
                    <p className="text-sm italic text-ink-400">
                      No excerpt available yet. Finish drafting to see a preview.
                    </p>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-4">
                    {record.status === "published" && record.views != null ? (
                      <span className="flex items-center gap-1.5 text-sm text-ink-500">
                        <Eye className="h-4 w-4" aria-hidden="true" />
                        {formatCount(record.views)} Views
                      </span>
                    ) : record.status === "scheduled" ? (
                      <span className="text-sm text-ink-500">Awaiting publish</span>
                    ) : (
                      <span className="text-sm italic text-ink-400">Unpublished</span>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(record)}
                      aria-label={`Edit ${record.article.title}`}
                      className="rounded-full p-2 text-brand-700 transition-colors hover:bg-brand-100"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
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
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Post" : "New Post"}
      >
        {drawerOpen ? (
          <NewsForm
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
