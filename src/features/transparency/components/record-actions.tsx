"use client";

import { Download, Eye, Mail } from "lucide-react";
import { RowActions, type RowAction } from "@/components/ui/row-actions";
import type { TransparencyFile } from "@/types";

interface RecordActionsProps {
  /** Named in the trigger's accessible label, e.g. "Ordinance No. 05, 2024". */
  label: string;
  /** Detail-page link, or null for records with no page of their own. */
  viewHref?: string | null;
  files: TransparencyFile[];
  className?: string;
}

/**
 * The row kebab for the public transparency tables.
 *
 * A thin client wrapper over RowActions taking only serializable props, so a
 * Server Component can render it: the Lucide icons are imported here rather
 * than handed down, which is what keeps the RSC icon boundary intact.
 *
 * Every file gets its own entry rather than hiding behind a "3 files"
 * disclosure — the menu is already a second click, and a third to reach the
 * actual PDF is one too many.
 *
 * Every row gets a kebab, including records with nothing to download, so the
 * Actions column holds one control of one width all the way down. A record
 * that exists only on paper offers "Request a copy" rather than nothing: the
 * previous design printed a bare note where the kebab would have been, which
 * both ragged the column and ended the trail for a resident who still needs
 * the document.
 */
export function RecordActions({ label, viewHref, files, className }: RecordActionsProps) {
  const actions: RowAction[] = [];

  if (viewHref) {
    actions.push({ label: "View record", icon: Eye, href: viewHref });
  }

  files.forEach((file, index) => {
    actions.push({
      label: file.label || `File ${index + 1}`,
      icon: Download,
      href: file.url,
      newTab: true,
    });
  });

  if (actions.length === 0) {
    // Not newTab: /contact is this site's own page, and forcing a new tab on
    // an internal link is a habit that loses people.
    actions.push({ label: "Request a copy", icon: Mail, href: "/contact" });
  }

  return <RowActions label={label} actions={actions} className={className} />;
}
