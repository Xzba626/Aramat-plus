"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Package,
  CircleDollarSign,
  Undo2,
  Users,
  Shield,
  AlertTriangle,
  Check,
  MoreVertical,
  Trash2,
  Eye,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";
import { resolveNotifTitle } from "@/lib/i18n/labels";
import {
  isEphemeralNotifId,
  notifDayGroup,
  sanitizeNotifMessageForDisplay,
  type NotifCategory,
  type NotifDayGroup,
  type NotifSeverity,
} from "@/lib/notifications/notification-meta";

export type NotifItem = {
  id: string;
  type: string;
  title: string | null;
  titleKey?: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
  href?: string | null;
  severity?: NotifSeverity;
  category?: NotifCategory;
  ephemeral?: boolean;
};

type Tab = "all" | "stock" | "actions" | "unread";
type ViewMode = "feed" | "history";
type HistoryPeriod = "today" | "yesterday" | "week" | "month" | "custom";

/** Build ISO range in the user's local calendar (not server UTC). */
function localPeriodBounds(
  period: HistoryPeriod,
  customFrom: string,
  customTo: string
): { from?: string; to?: string } {
  const now = new Date();
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  if (period === "today") {
    return {
      from: startOfDay(now).toISOString(),
      to: endOfDay(now).toISOString(),
    };
  }
  if (period === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return {
      from: startOfDay(y).toISOString(),
      to: endOfDay(y).toISOString(),
    };
  }
  if (period === "week") {
    const from = startOfDay(now);
    from.setDate(from.getDate() - 6);
    return { from: from.toISOString(), to: endOfDay(now).toISOString() };
  }
  if (period === "month") {
    const from = startOfDay(now);
    from.setDate(from.getDate() - 29);
    return { from: from.toISOString(), to: endOfDay(now).toISOString() };
  }
  return {
    from: customFrom ? new Date(customFrom).toISOString() : undefined,
    to: customTo
      ? endOfDay(new Date(customTo)).toISOString()
      : undefined,
  };
}

const SEVERITY_DOT: Record<NotifSeverity, string> = {
  info: "bg-success",
  warning: "bg-warning",
  critical: "bg-danger",
  success: "bg-brand",
};

function CategoryIcon({
  category,
  className,
}: {
  category: NotifCategory;
  className?: string;
}) {
  const cls = cn("h-4 w-4 shrink-0", className);
  switch (category) {
    case "security":
      return <Shield className={cls} aria-hidden />;
    case "warehouse":
      return <Package className={cls} aria-hidden />;
    case "sales":
      return <CircleDollarSign className={cls} aria-hidden />;
    case "returns":
      return <Undo2 className={cls} aria-hidden />;
    case "users":
      return <Users className={cls} aria-hidden />;
    default:
      return <AlertTriangle className={cls} aria-hidden />;
  }
}

function NotifMenu({
  item,
  onMarkRead,
  onDelete,
  t,
}: {
  item: NotifItem;
  onMarkRead: () => void;
  onDelete: () => void;
  t: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const canDelete = !item.ephemeral && !isEphemeralNotifId(item.id);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="rounded-lg p-1.5 text-muted hover:bg-page hover:text-ink"
        aria-label={t("notificationsPage.menu")}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 min-w-[180px] rounded-xl border border-border bg-card py-1 shadow-lg">
          {item.href ? (
            <Link
              href={item.href}
              className="flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-page"
              onClick={() => setOpen(false)}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("notificationsPage.openDetails")}
            </Link>
          ) : null}
          {!item.isRead ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-page"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                onMarkRead();
              }}
            >
              <Check className="h-3.5 w-3.5" />
              {t("notificationsPage.markRead")}
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/5"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                onDelete();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("notificationsPage.delete")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function NotifCard({
  item,
  onMarkRead,
  onDelete,
}: {
  item: NotifItem;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t, formatDateTime } = useI18n();
  const severity = item.severity ?? "info";
  const category = item.category ?? "system";
  const title = resolveNotifTitle(item.title, item.titleKey, t);
  const message = sanitizeNotifMessageForDisplay(
    item.message || "",
    t("notificationsPage.ipLocal")
  );

  const inner = (
    <Card
      className={cn(
        "flex gap-3 p-4 transition",
        !item.isRead && "border-brand/25 bg-brand-soft/25",
        item.href && "hover:border-brand/35"
      )}
    >
      <div className="flex flex-col items-center gap-2 pt-0.5">
        <span
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full",
            !item.isRead ? SEVERITY_DOT[severity] : "bg-border"
          )}
          title={t(`notificationsPage.severity.${severity}`)}
        />
        <span
          className={cn(
            "rounded-lg p-1.5",
            severity === "critical"
              ? "bg-danger/10 text-danger"
              : severity === "warning"
                ? "bg-warning/15 text-warning"
                : severity === "success"
                  ? "bg-brand/10 text-brand"
                  : "bg-page text-muted"
          )}
        >
          <CategoryIcon category={category} />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "font-semibold text-ink",
                  !item.isRead && "text-ink"
                )}
              >
                {title}
              </span>
              {!item.isRead ? (
                <span className="rounded-md bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                  {t("notificationsPage.badgeNew")}
                </span>
              ) : null}
            </div>
            {message ? (
              <div className="mt-1 text-sm whitespace-pre-line text-muted">
                {message}
              </div>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <time className="tabular-nums" dateTime={item.createdAt}>
                {formatDateTime(item.createdAt)}
              </time>
              <span className="text-muted/80">
                {t(`notificationsPage.cat.${category}`)}
              </span>
              {item.href ? (
                <span className="font-semibold text-brand">
                  {t("dashboard.openAction")} →
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {!item.isRead ? (
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted hover:bg-page hover:text-brand"
                title={t("notificationsPage.markRead")}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onMarkRead(item.id);
                }}
              >
                <Eye className="h-4 w-4" />
              </button>
            ) : null}
            <NotifMenu
              item={item}
              t={t}
              onMarkRead={() => onMarkRead(item.id)}
              onDelete={() => onDelete(item.id)}
            />
          </div>
        </div>
      </div>
    </Card>
  );

  if (item.href) {
    return (
      <Link href={item.href} className="block">
        {inner}
      </Link>
    );
  }
  return <div>{inner}</div>;
}

type Props = {
  /** Compact POS layout without ModuleWorkspace KPIs */
  variant?: "owner" | "pos";
};

export function NotificationCenter({ variant = "owner" }: Props) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [view, setView] = useState<ViewMode>("feed");
  const [period, setPeriod] = useState<HistoryPeriod>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const invalidateBadge = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["cache:notifications-count"],
    });
  }, [queryClient]);

  const buildUrl = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams();
      params.set("limit", "50");
      params.set("view", view);
      if (cursor) params.set("cursor", cursor);
      if (view === "history") {
        const bounds = localPeriodBounds(period, customFrom, customTo);
        if (bounds.from) params.set("from", bounds.from);
        if (bounds.to) params.set("to", bounds.to);
      }
      return `/api/notifications?${params.toString()}`;
    },
    [view, period, customFrom, customTo]
  );

  const load = useCallback(
    async (opts?: { append?: boolean; cursor?: string | null }) => {
      if (opts?.append) setLoadingMore(true);
      else setLoading(true);
      try {
        const res = await fetch(buildUrl(opts?.cursor));
        const data = await res.json();
        if (!res.ok) return;
        const list = Array.isArray(data)
          ? (data as NotifItem[])
          : ((data.items ?? []) as NotifItem[]);
        const cursorOut = Array.isArray(data)
          ? null
          : ((data.nextCursor as string | null) ?? null);
        const more = Array.isArray(data)
          ? false
          : Boolean(data.hasMore);
        setItems((prev) => (opts?.append ? [...prev, ...list] : list));
        setNextCursor(cursorOut);
        setHasMore(more);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildUrl]
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markAllRead" }),
    });
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    invalidateBadge();
  }

  async function markRead(id: string) {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markRead", id }),
    });
    invalidateBadge();
  }

  async function deleteOne(id: string) {
    setItems((prev) => prev.filter((n) => n.id !== id));
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    invalidateBadge();
  }

  const filtered = useMemo(() => {
    return items.filter((n) => {
      const title = resolveNotifTitle(n.title, n.titleKey, t);
      const text = `${title} ${n.message} ${n.type}`.toLowerCase();
      const matchQ = !q.trim() || text.includes(q.toLowerCase());
      if (!matchQ) return false;
      if (tab === "unread") return !n.isRead;
      if (tab === "stock")
        return (
          n.type === "LOW_STOCK" ||
          n.category === "warehouse" ||
          /stock|low/i.test(n.type)
        );
      if (tab === "actions")
        return (
          /DISCOUNT|RETURN|REQUEST|SYSTEM/i.test(n.type) ||
          n.category === "security" ||
          n.category === "sales" ||
          n.category === "returns"
        );
      return true;
    });
  }, [items, tab, q, t]);

  const groups = useMemo(() => {
    const order: NotifDayGroup[] = ["today", "yesterday", "earlier"];
    const map: Record<NotifDayGroup, NotifItem[]> = {
      today: [],
      yesterday: [],
      earlier: [],
    };
    for (const n of filtered) {
      map[notifDayGroup(n.createdAt)].push(n);
    }
    return order
      .map((key) => ({ key, items: map[key] }))
      .filter((g) => g.items.length > 0);
  }, [filtered]);

  const unread = items.filter((n) => !n.isRead).length;

  const tabs: { id: Tab; labelKey: string }[] = [
    { id: "all", labelKey: "notificationsPage.tabAll" },
    { id: "unread", labelKey: "notificationsPage.tabUnread" },
    { id: "stock", labelKey: "notificationsPage.tabStock" },
    { id: "actions", labelKey: "notificationsPage.tabActions" },
  ];

  const periods: { id: HistoryPeriod; labelKey: string }[] = [
    { id: "today", labelKey: "notificationsPage.periodToday" },
    { id: "yesterday", labelKey: "notificationsPage.periodYesterday" },
    { id: "week", labelKey: "notificationsPage.periodWeek" },
    { id: "month", labelKey: "notificationsPage.periodMonth" },
    { id: "custom", labelKey: "notificationsPage.periodCustom" },
  ];

  const listBody = (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(
          [
            ["feed", "notificationsPage.viewFeed"],
            ["history", "notificationsPage.viewHistory"],
          ] as const
        ).map(([id, key]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={cn(
              "rounded-xl px-3.5 py-2 text-sm font-semibold",
              view === id
                ? "bg-ink text-white"
                : "bg-card text-muted ring-1 ring-border"
            )}
          >
            {t(key)}
          </button>
        ))}
      </div>

      {view === "history" ? (
        <div className="mb-4 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {periods.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-xs font-semibold",
                  period === p.id
                    ? "bg-brand text-white"
                    : "bg-card text-muted ring-1 ring-border"
                )}
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>
          {period === "custom" ? (
            <div className="flex flex-wrap gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-xl px-3.5 py-2 text-sm font-semibold",
              tab === item.id
                ? "bg-brand text-white"
                : "bg-card text-muted ring-1 ring-border"
            )}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("notificationsPage.search")}
        className="mb-4 w-full max-w-lg rounded-xl border border-border bg-card px-3 py-2 text-sm"
      />

      {loading ? (
        <Card className="p-5 text-sm text-muted">{t("common.loading")}</Card>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-page text-muted">
            <Bell className="h-6 w-6" />
          </span>
          <div className="text-sm font-semibold text-ink">
            {t("notificationsPage.emptyTitle")}
          </div>
          <p className="max-w-sm text-sm text-muted">
            {t("notificationsPage.emptyBody")}
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.key} className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted">
                {t(`notificationsPage.group.${g.key}`)}
              </h3>
              <div className="space-y-2">
                {g.items.map((n) => (
                  <NotifCard
                    key={n.id}
                    item={n}
                    onMarkRead={markRead}
                    onDelete={deleteOne}
                  />
                ))}
              </div>
            </div>
          ))}
          {hasMore ? (
            <div className="pt-2 text-center">
              <Button
                type="button"
                variant="secondary"
                fullWidth={false}
                disabled={loadingMore}
                onClick={() => void load({ append: true, cursor: nextCursor })}
              >
                {loadingMore
                  ? t("common.loading")
                  : t("notificationsPage.loadMore")}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </>
  );

  if (variant === "pos") {
    return (
      <div className="space-y-4 pb-20">
        <div className="text-center">
          <h1 className="text-xl font-bold text-ink">
            {t("pos.notifications")}
          </h1>
          <p className="mt-1 text-sm text-muted">{t("pos.subtitle")}</p>
        </div>
        <button
          type="button"
          className="w-full text-sm font-semibold text-brand"
          onClick={markAllRead}
          disabled={!unread}
        >
          {t("pos.markAllRead")}
        </button>
        {listBody}
      </div>
    );
  }

  return (
    <ModuleWorkspace
      title={t("notificationsPage.title")}
      subtitle={t("notificationsPage.subtitle")}
      kpis={[
        {
          label: t("notificationsPage.total"),
          value: loading ? "…" : String(items.length),
        },
        {
          label: t("notificationsPage.unread"),
          value: loading ? "…" : String(unread),
        },
        {
          label: t("notificationsPage.onScreen"),
          value: loading ? "…" : String(filtered.length),
        },
      ]}
      actions={
        <Button
          type="button"
          variant="secondary"
          fullWidth={false}
          onClick={markAllRead}
          disabled={!unread}
        >
          {t("notificationsPage.markAll")}
        </Button>
      }
    >
      <ModuleSection
        title={
          view === "history"
            ? t("notificationsPage.historyTitle")
            : t("notificationsPage.feed")
        }
      >
        {listBody}
      </ModuleSection>
    </ModuleWorkspace>
  );
}
