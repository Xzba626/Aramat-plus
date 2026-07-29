"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useT } from "@/components/i18n/i18n-provider";

export function DataTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-[18px] border border-border bg-card shadow-[var(--shadow-card)]", className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function DataTableToolbar({
  search,
  onSearchChange,
  filters,
  actions,
}: {
  search?: string;
  onSearchChange?: (v: string) => void;
  filters?: ReactNode;
  actions?: ReactNode;
}) {
  const t = useT();
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        {onSearchChange ? (
          <input
            className="max-w-xs"
            placeholder={t("common.search")}
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        ) : null}
        {filters}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function DataTableElement({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <table className={cn("w-full min-w-[640px] border-collapse text-sm", className)}>
      {children}
    </table>
  );
}

export function DataTableHead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-border bg-page/80 text-left text-xs font-semibold uppercase tracking-wide text-muted">
        {children}
      </tr>
    </thead>
  );
}

export function DataTableTh({
  children,
  className,
  sortable,
  sorted,
  onSort,
}: {
  children: ReactNode;
  className?: string;
  sortable?: boolean;
  sorted?: "asc" | "desc" | false;
  onSort?: () => void;
}) {
  return (
    <th className={cn("px-4 py-3 font-semibold", className)}>
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className="inline-flex items-center gap-1 hover:text-ink"
        >
          {children}
          {sorted ? <span className="text-brand">{sorted === "asc" ? "↑" : "↓"}</span> : null}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function DataTableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function DataTableRow({
  children,
  className,
  selected,
}: {
  children: ReactNode;
  className?: string;
  selected?: boolean;
}) {
  return (
    <tr
      className={cn(
        "transition hover:bg-page/60",
        selected && "bg-brand-soft/50",
        className
      )}
    >
      {children}
    </tr>
  );
}

export function DataTableTd({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={cn("px-4 py-3 text-ink", className)}>{children}</td>;
}

export function DataTablePagination({
  page,
  pages,
  total,
  onPageChange,
}: {
  page: number;
  pages: number;
  total: number;
  onPageChange: (p: number) => void;
}) {
  const t = useT();
  if (pages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted">
      <span>
        {t("common.recordsPage", { total, page, pages })}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-lg px-2 py-1 hover:bg-page disabled:opacity-40"
        >
          {t("common.back")}
        </button>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-lg px-2 py-1 hover:bg-page disabled:opacity-40"
        >
          {t("common.next")}
        </button>
      </div>
    </div>
  );
}
