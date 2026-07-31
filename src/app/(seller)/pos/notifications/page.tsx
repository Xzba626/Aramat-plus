"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";

type Notif = {
  id: string;
  titleKey: string;
  messageKey?: string;
  message?: string;
  timeKey: string;
  unread: boolean;
  kind: "action" | "stock";
};

const MOCK: Notif[] = [
  {
    id: "1",
    titleKey: "pos.discountApproved",
    messageKey: "pos.mockDiscountMsg",
    timeKey: "pos.timeToday",
    unread: true,
    kind: "action",
  },
  {
    id: "2",
    titleKey: "pos.lowStockTitle",
    messageKey: "pos.mockStockMsg",
    timeKey: "pos.timeToday",
    unread: true,
    kind: "stock",
  },
  {
    id: "3",
    titleKey: "pos.returnRejected",
    messageKey: "pos.mockReturnMsg",
    timeKey: "pos.timeYesterday",
    unread: false,
    kind: "action",
  },
];

type Tab = "all" | "unread" | "stock" | "actions";

export default function PosNotificationsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("all");
  const [items, setItems] = useState(MOCK);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return items.filter((n) => {
      const title = t(n.titleKey);
      const message = n.messageKey ? t(n.messageKey) : n.message ?? "";
      const matchQ =
        !q.trim() ||
        `${title} ${message}`.toLowerCase().includes(q.toLowerCase());
      if (!matchQ) return false;
      if (tab === "unread") return n.unread;
      if (tab === "stock") return n.kind === "stock";
      if (tab === "actions") return n.kind === "action";
      return true;
    });
  }, [items, tab, q, t]);

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
        onClick={() => setItems((prev) => prev.map((n) => ({ ...n, unread: false })))}
      >
        {t("pos.markAllRead")}
      </button>

      <div className="space-y-2">
        {filtered.map((n) => {
          const title = t(n.titleKey);
          const message = n.messageKey ? t(n.messageKey) : n.message ?? "";
          return (
            <Card
              key={n.id}
              className={cn("p-4 text-left", n.unread && "border-brand/30 bg-brand-soft/20")}
            >
              <div className="text-sm font-semibold text-ink">{title}</div>
              <div className="mt-1 text-sm text-muted">{message}</div>
              <div className="mt-2 text-xs text-muted">{t(n.timeKey)}</div>
            </Card>
          );
        })}
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{t("common.noData")}</p>
        ) : null}
      </div>
    </div>
  );
}
