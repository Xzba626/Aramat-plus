"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";
import { resolveNotifTitle } from "@/lib/i18n/labels";

type Notif = {
  id: string;
  type: string;
  title: string | null;
  titleKey?: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
};

type Tab = "all" | "unread" | "stock" | "actions";

export default function PosNotificationsPage() {
  const { t, formatDateTime } = useI18n();
  const [tab, setTab] = useState<Tab>("all");
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications");
    const data = await res.json();
    if (res.ok && Array.isArray(data)) setItems(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return items.filter((n) => {
      const title = resolveNotifTitle(n.title, n.titleKey, t);
      const matchQ =
        !q.trim() ||
        `${title} ${n.message}`.toLowerCase().includes(q.toLowerCase());
      if (!matchQ) return false;
      if (tab === "unread") return !n.isRead;
      if (tab === "stock")
        return n.type === "LOW_STOCK" || /stock|low/i.test(n.type);
      if (tab === "actions")
        return /DISCOUNT|RETURN|REQUEST|SYSTEM/i.test(n.type);
      return true;
    });
  }, [items, tab, q, t]);

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markAllRead" }),
    });
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }

  return (
    <div className="space-y-4 pb-20">
      <div className="text-center">
        <h1 className="text-xl font-bold text-ink">{t("pos.notifications")}</h1>
        <p className="mt-1 text-sm text-muted">{t("pos.subtitle")}</p>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("common.search")}
        className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm"
      />

      <div className="flex gap-1.5 overflow-x-auto">
        {(
          [
            ["all", "pos.allCategories"],
            ["unread", "pos.tabUnread"],
            ["stock", "pos.tabStock"],
            ["actions", "pos.tabActions"],
          ] as const
        ).map(([id, key]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-2 text-sm font-medium",
              tab === id
                ? "bg-brand text-white"
                : "bg-card text-muted ring-1 ring-border"
            )}
          >
            {t(key)}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="w-full text-sm font-semibold text-brand"
        onClick={markAllRead}
      >
        {t("pos.markAllRead")}
      </button>

      <div className="space-y-2">
        {loading ? (
          <p className="py-8 text-center text-sm text-muted">{t("common.loading")}</p>
        ) : null}
        {!loading &&
          filtered.map((n) => {
            const title = resolveNotifTitle(n.title, n.titleKey, t);
            return (
              <Card
                key={n.id}
                className={cn(
                  "p-4 text-left",
                  !n.isRead && "border-brand/30 bg-brand-soft/20"
                )}
              >
                <div className="text-sm font-semibold text-ink">{title}</div>
                <div className="mt-1 text-sm whitespace-pre-line text-muted">{n.message}</div>
                <div className="mt-2 text-xs text-muted">
                  {formatDateTime(n.createdAt)}
                </div>
              </Card>
            );
          })}
        {!loading && filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{t("common.noData")}</p>
        ) : null}
      </div>
    </div>
  );
}
