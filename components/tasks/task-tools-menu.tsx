"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useSearchParams } from "next/navigation";
import {
  MoreHorizontal,
  Upload,
  CopyMinus,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

/**
 * The "⋯" import/export menu for the Tasks + Archived lists.
 *
 * Lifted out of the FilterBar so it can sit directly beside the "Kanban View"
 * button in the page header. Reading `useSearchParams()` here (rather than
 * taking the query string as a prop) keeps the export links in sync with the
 * live filters without the server page having to re-render — the same way it
 * behaved inside the bar.
 *
 * Admin-only; the caller gates on `me.isAdmin`.
 */
export function TaskToolsMenu() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const buildExportHref = (path: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (pathname === "/archived") sp.set("archived", "1");
    return `${path}?${sp.toString()}`;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Import and export"
          title="Import / export"
          // Matches the Kanban View button's height + hairline ring so the two
          // read as one control pair.
          className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong shrink-0"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
        >
          <MoreHorizontal size={16} strokeWidth={2.4} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={"/tasks/import" as Route}>
            <Upload size={14} strokeWidth={2} style={{ color: "var(--color-altus-red)" }} />
            Import Tasks
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={"/tasks/duplicates" as Route}>
            <CopyMinus size={14} strokeWidth={2} style={{ color: "var(--color-amber-deep, #b45309)" }} />
            Find Duplicates
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={buildExportHref("/tasks/export.xlsx")} download>
            <FileSpreadsheet size={14} strokeWidth={2} style={{ color: "var(--color-success, #16a34a)" }} />
            Export XLS
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={buildExportHref("/tasks/export.pdf")} download>
            <FileText size={14} strokeWidth={2} style={{ color: "var(--color-altus-red, #dc2626)" }} />
            Export PDF
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
