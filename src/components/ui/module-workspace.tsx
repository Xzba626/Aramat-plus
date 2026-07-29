import { ReactNode } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ModuleTab = {
  id: string;
  label: string;
  href?: string;
};

export type ModuleKpi = {
  label: string;
  value: string;
  hint?: string;
};

export function ModuleTabs({
  tabs,
  activeId,
}: {
  tabs: ModuleTab[];
  activeId: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap gap-1.5 border-b border-border pb-3">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        const className = cn(
          "rounded-xl px-3.5 py-2 text-sm font-semibold transition",
          active
            ? "bg-brand text-white"
            : "bg-card text-muted ring-1 ring-border hover:text-ink"
        );
        if (tab.href) {
          return (
            <Link key={tab.id} href={tab.href} className={className}>
              {tab.label}
            </Link>
          );
        }
        return (
          <span key={tab.id} className={className}>
            {tab.label}
          </span>
        );
      })}
    </div>
  );
}

export function ModuleKpiRow({ items }: { items: ModuleKpi[] }) {
  return (
    <div
      className={cn(
        "mb-5 grid gap-3",
        items.length <= 2 && "sm:grid-cols-2",
        items.length === 3 && "sm:grid-cols-3",
        items.length >= 4 && "sm:grid-cols-2 xl:grid-cols-4"
      )}
    >
      {items.map((kpi) => (
        <Card key={kpi.label} className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">
            {kpi.label}
          </div>
          <div className="mt-2 text-xl font-bold tabular-nums text-ink">
            {kpi.value}
          </div>
          {kpi.hint ? (
            <div className="mt-1 text-xs text-muted">{kpi.hint}</div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

export function ModuleTableShell({
  columns,
  emptyTitle,
  emptyHint,
  children,
}: {
  columns: string[];
  emptyTitle: string;
  emptyHint?: string;
  children?: ReactNode;
}) {
  const hasRows = Boolean(children);

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-page/80 text-xs uppercase tracking-wide text-muted">
            <tr>
              {columns.map((col) => (
                <th key={col} className="px-4 py-3 font-semibold">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          {hasRows ? <tbody>{children}</tbody> : null}
        </table>
      </div>
      {!hasRows ? (
        <div className="px-4 py-10 text-center">
          <div className="text-sm font-semibold text-ink">{emptyTitle}</div>
          {emptyHint ? (
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">{emptyHint}</p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

export function ModuleWorkspace({
  title,
  count,
  subtitle,
  actions,
  tabs,
  activeTab,
  kpis,
  children,
}: {
  title: string;
  count?: number | null;
  subtitle?: string;
  actions?: ReactNode;
  tabs?: ModuleTab[];
  activeTab?: string;
  kpis?: ModuleKpi[];
  children: ReactNode;
}) {
  return (
    <div>
      <PageHeader
        title={title}
        count={count}
        subtitle={subtitle}
        actions={actions}
      />
      {tabs && activeTab ? <ModuleTabs tabs={tabs} activeId={activeTab} /> : null}
      {kpis?.length ? <ModuleKpiRow items={kpis} /> : null}
      {children}
    </div>
  );
}

export function ModuleSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
