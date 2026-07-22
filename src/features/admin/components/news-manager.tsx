"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Archive, ImageIcon, Megaphone, Newspaper, Pencil, Plus, Send } from "lucide-react";
import type { AdminAnnouncementRow, AdminNewsArticleRow, NewsCategoryRow } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer } from "@/components/ui/drawer";
import { RowActions, type RowAction } from "@/components/ui/row-actions";
import { Toast } from "@/components/ui/toast";
import { useEditDeepLink } from "@/hooks/use-edit-deep-link";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { fuzzyFilter, haystack } from "@/lib/fuzzy";
import { cn } from "@/lib/utils";
import {
  archiveAnnouncement,
  getAnnouncementForEditAction,
  publishAnnouncement,
} from "@/features/admin/actions/announcements";
import {
  archiveNewsArticle,
  getNewsArticleForEditAction,
  publishNewsArticle,
} from "@/features/admin/actions/news";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminPagination } from "./admin-pagination";
import { AnnouncementForm, type AnnouncementEditRecord } from "./announcement-form";
import { NewsForm, type NewsEditRecord } from "./news-form";
import { StatusChip } from "./status-chip";

const PAGE_SIZE = 8;

type Tab = "news" | "announcements";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "in-review", label: "In Review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

interface NewsManagerProps {
  articles: AdminNewsArticleRow[];
  announcements: AdminAnnouncementRow[];
  categories: NewsCategoryRow[];
}

/**
 * An archive awaiting confirmation. Null when no dialog is open.
 *
 * Only archive is confirmed: news and announcements have no delete action —
 * published bulletins are the barangay's public record and are taken down, not
 * erased.
 */
type PendingArchive = { kind: Tab; id: string; title: string } | null;

/** News & announcements: tabbed card grids, search/category/status filters, drawer editors backed by real actions. */
export function NewsManager({ articles, announcements, categories }: NewsManagerProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("news");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const [editingNews, setEditingNews] = useState<NewsEditRecord | null>(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState<AnnouncementEditRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<PendingArchive>(null);
  const [actionPending, setActionPending] = useState(false);
  const { toast, showToast, showError, dismissToast } = useToast();
  const [, startTransition] = useTransition();

  const resetPage = () => setPage(1);

  const switchTab = (next: Tab) => {
    setTab(next);
    setSearch("");
    setCategoryId("all");
    setStatus("all");
    setPage(1);
  };

  const filteredNews = useMemo(() => {
    const narrowed = articles.filter(
      (a) =>
        (categoryId === "all" || a.categoryId === categoryId) &&
        (status === "all" || a.status === status),
    );
    return fuzzyFilter(narrowed, search, (a) => haystack(a.title, a.category));
  }, [articles, search, categoryId, status]);

  const filteredAnnouncements = useMemo(() => {
    const narrowed = announcements.filter((a) => status === "all" || a.status === status);
    return fuzzyFilter(narrowed, search, (a) => a.title);
  }, [announcements, search, status]);

  const newsPageItems = filteredNews.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const announcementPageItems = filteredAnnouncements.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openCreate = () => {
    setEditingNews(null);
    setEditingAnnouncement(null);
    setDrawerOpen(true);
  };

  const openEditNews = (row: AdminNewsArticleRow) => {
    setLoadingEditId(row.id);
    startTransition(async () => {
      try {
        const detail = await getNewsArticleForEditAction(row.id);
        if (!detail) {
          showError("Could not load that post.");
          return;
        }
        setEditingNews({ id: row.id, values: detail.values, status: detail.status, photos: detail.photos });
        setDrawerOpen(true);
      } finally {
        setLoadingEditId(null);
      }
    });
  };

  const openEditAnnouncement = (row: AdminAnnouncementRow) => {
    setLoadingEditId(row.id);
    startTransition(async () => {
      try {
        const detail = await getAnnouncementForEditAction(row.id);
        if (!detail) {
          showError("Could not load that announcement.");
          return;
        }
        setEditingAnnouncement({ id: row.id, values: detail.values, status: detail.status });
        setDrawerOpen(true);
      } finally {
        setLoadingEditId(null);
      }
    });
  };

  // Creating a new post must keep the drawer open so the photo uploader (which
  // needs an article id) becomes reachable in place; editing still closes as before.
  /*
   * Global-search results link here as /admin/news?tab=…&edit=<id>. Two
   * modules share this page, so the id alone would be ambiguous — the tab
   * says which list to look in, and switching to it is part of arriving.
   */
  useEditDeepLink("edit", (id) => {
    const article = articles.find((r) => r.id === id);
    if (article) {
      setTab("news");
      openEditNews(article);
      return;
    }
    const announcement = announcements.find((r) => r.id === id);
    if (announcement) {
      setTab("announcements");
      openEditAnnouncement(announcement);
      return;
    }
    showError("That post no longer exists.");
  });

  const handleSaved = (message: string, keepOpen = false) => {
    if (!keepOpen) setDrawerOpen(false);
    showToast(message);
  };

  const publish = (kind: Tab, id: string, title: string) => {
    startTransition(async () => {
      const result = kind === "news" ? await publishNewsArticle(id) : await publishAnnouncement(id);
      if (result.error) {
        showError(result.error);
        return;
      }
      showToast(`Published ${title}.`);
      router.refresh();
    });
  };

  /** Run the confirmed archive; the dialog stays locked until it answers. */
  const runConfirmed = () => {
    if (!confirming) return;
    const { kind, id, title } = confirming;
    setActionPending(true);
    startTransition(async () => {
      const result =
        kind === "news" ? await archiveNewsArticle(id) : await archiveAnnouncement(id);
      setActionPending(false);
      setConfirming(null);
      if (result.error) {
        showError(result.error);
        return;
      }
      showToast(`Archived ${title}.`);
      router.refresh();
    });
  };

  /** Shared between the two card grids — the workflow is identical. */
  const actionsFor = (
    kind: Tab,
    record: { id: string; title: string; status: string },
    onEdit: () => void,
  ): RowAction[] => {
    const actions: RowAction[] = [
      {
        label: kind === "news" ? "Edit post" : "Edit announcement",
        icon: Pencil,
        onSelect: onEdit,
        disabled: loadingEditId === record.id,
      },
    ];
    if (record.status !== "published") {
      actions.push({
        label: "Publish",
        icon: Send,
        onSelect: () => publish(kind, record.id, record.title),
      });
    } else {
      actions.push({
        label: "Archive",
        icon: Archive,
        tone: "danger",
        onSelect: () => setConfirming({ kind, id: record.id, title: record.title }),
      });
    }
    return actions;
  };

  const clearFilters = () => {
    setSearch("");
    setCategoryId("all");
    setStatus("all");
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
            {tab === "news" ? "New Post" : "New Announcement"}
          </Button>
        }
      />
      <div
        role="tablist"
        aria-label="Content type"
        className="mb-6 inline-flex rounded-full border border-ink-200/70 bg-white p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "news"}
          onClick={() => switchTab("news")}
          className={cn(
            "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
            tab === "news" ? "bg-brand-500 text-ink-900" : "text-ink-600 hover:bg-ink-50",
          )}
        >
          <Newspaper className="h-4 w-4" aria-hidden="true" />
          News
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "announcements"}
          onClick={() => switchTab("announcements")}
          className={cn(
            "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
            tab === "announcements" ? "bg-brand-500 text-ink-900" : "text-ink-600 hover:bg-ink-50",
          )}
        >
          <Megaphone className="h-4 w-4" aria-hidden="true" />
          Announcements
        </button>
      </div>
      <Card className="mb-6 p-5">
        <AdminFilterBar
          search={{
            id: "news-search",
            value: search,
            placeholder: tab === "news" ? "Search posts..." : "Search announcements...",
            onChange: (value) => {
              setSearch(value);
              resetPage();
            },
          }}
          selects={[
            ...(tab === "news"
              ? [
                  {
                    id: "news-category-filter",
                    label: "Category",
                    value: categoryId,
                    options: [
                      { value: "all", label: "All Categories" },
                      ...categories.map((c) => ({ value: c.id, label: c.label })),
                    ],
                    onChange: (value: string) => {
                      setCategoryId(value);
                      resetPage();
                    },
                  },
                ]
              : []),
            {
              id: "news-status-filter",
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
      {tab === "news" ? (
        filteredNews.length === 0 ? (
          <Card>
            <AdminEmptyState message="No posts match your filters." onClear={clearFilters} />
          </Card>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
              {newsPageItems.map((record) => (
                <Card key={record.id} className="flex flex-col overflow-hidden">
                  <div className="relative aspect-4/3 bg-ink-100">
                    {record.coverSrc ? (
                      <Image
                        src={record.coverSrc}
                        alt={record.coverAlt}
                        fill
                        sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-ink-400">
                        <ImageIcon className="h-10 w-10" aria-hidden="true" />
                      </div>
                    )}
                    <StatusChip status={record.status} className="absolute right-3 top-3 shadow-sm" />
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <div className="mb-3 flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold uppercase tracking-wider text-ink-500">
                        {record.category}
                      </span>
                      <span className="text-ink-500">
                        {record.publishedLabel ? `Published ${record.publishedLabel}` : `Updated ${record.updatedLabel}`}
                      </span>
                    </div>
                    <h3 className="mb-2 line-clamp-2 font-display text-lg font-semibold tracking-tight text-ink-900">
                      {record.title}
                    </h3>
                    {record.excerpt ? (
                      <p className="line-clamp-3 text-sm text-ink-600">{record.excerpt}</p>
                    ) : (
                      <p className="text-sm italic text-ink-400">No excerpt yet.</p>
                    )}
                    <div className="mt-auto flex items-center justify-between pt-4">
                      <span className="text-sm text-ink-500">
                        {record.photoCount} photo{record.photoCount === 1 ? "" : "s"}
                      </span>
                      <RowActions
                        label={record.title}
                        actions={actionsFor("news", record, () => openEditNews(record))}
                      />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            <AdminPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={filteredNews.length}
              onPageChange={setPage}
              className="mt-6"
            />
          </>
        )
      ) : filteredAnnouncements.length === 0 ? (
        <Card>
          <AdminEmptyState message="No announcements match your filters." onClear={clearFilters} />
        </Card>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {announcementPageItems.map((record) => (
              <Card key={record.id} className="flex flex-col overflow-hidden">
                <div className="relative aspect-4/3 bg-ink-100">
                  {record.imageSrc ? (
                    <Image
                      src={record.imageSrc}
                      alt={record.imageAlt}
                      fill
                      sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-ink-400">
                      <ImageIcon className="h-10 w-10" aria-hidden="true" />
                    </div>
                  )}
                  <StatusChip status={record.status} className="absolute right-3 top-3 shadow-sm" />
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="mb-3 flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold uppercase tracking-wider text-ink-500">
                      {record.urgent ? "Urgent" : "Announcement"}
                    </span>
                    <span className="text-ink-500">{formatDate(record.date)}</span>
                  </div>
                  <h3 className="mb-2 line-clamp-2 font-display text-lg font-semibold tracking-tight text-ink-900">
                    {record.title}
                  </h3>
                  {record.excerpt ? (
                    <p className="line-clamp-3 text-sm text-ink-600">{record.excerpt}</p>
                  ) : (
                    <p className="text-sm italic text-ink-400">No excerpt yet.</p>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-4">
                    <span className="text-sm text-ink-500">Updated {record.updatedLabel}</span>
                    <RowActions
                      label={record.title}
                      actions={actionsFor("announcements", record, () =>
                        openEditAnnouncement(record),
                      )}
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <AdminPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={filteredAnnouncements.length}
            onPageChange={setPage}
            className="mt-6"
          />
        </>
      )}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={
          tab === "news"
            ? editingNews
              ? "Edit Post"
              : "New Post"
            : editingAnnouncement
              ? "Edit Announcement"
              : "New Announcement"
        }
      >
        {drawerOpen ? (
          tab === "news" ? (
            <NewsForm
              key={editingNews?.id ?? "new-news"}
              record={editingNews}
              categories={categories}
              onSaved={handleSaved}
              onCancel={() => setDrawerOpen(false)}
            />
          ) : (
            <AnnouncementForm
              key={editingAnnouncement?.id ?? "new-announcement"}
              record={editingAnnouncement}
              onSaved={handleSaved}
              onCancel={() => setDrawerOpen(false)}
            />
          )
        ) : null}
      </Drawer>
      <ConfirmDialog
        open={confirming !== null}
        title={confirming?.kind === "news" ? "Archive this post?" : "Archive this announcement?"}
        body={
          <>
            <strong className="font-semibold text-ink-900">{confirming?.title}</strong> will be
            removed from the public site. The record is kept and can be published again later.
          </>
        }
        confirmLabel="Archive"
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
