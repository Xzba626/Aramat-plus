"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";

type Notif = {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  href?: string | null;
};

type Tab = "all" | "stock" | "actions" | "unread";

export default function NotificationsPage() {
  const { t, formatDateTime } = useI18n();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");

  async function load() {
    const res = await fetch("/api/notifications");
    const data = await res.json();
    if (res.ok && Array.isArray(data)) setItems(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markAllRead" }),
    });
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }

  const filtered = useMemo(() => {
    return items.filter((n) => {
      const text = `${n.title} ${n.message} ${n.type}`.toLowerCase();
      const matchQ = !q.trim() || text.includes(q.toLowerCase());
      if (!matchQ) return false;
      if (tab === "unread") return !n.isRead;
      if (tab === "stock")
        return /stock|остат|товар|парти|боқимонда|мол/i.test(text);
      if (tab === "actions")
        return /скидк|возврат|ревиз|запрос|решен|тахфиф|бозгашт|дархост/i.test(
          text
        );
      return true;
    });
  }, [items, tab, q]);

  const unread = items.filter((n) => !n.isRead).length;

  const tabs: { id: Tab; labelKey: string }[] = [
    { id: "all", labelKey: "notificationsPage.tabAll" },
    { id: "unread", labelKey: "notificationsPage.tabUnread" },
    { id: "stock", labelKey: "notificationsPage.tabStock" },
    { id: "actions", labelKey: "notificationsPage.tabActions" },
  ];

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

      <ModuleSection title={t("notificationsPage.feed")}>
        {loading ? (
          <Card className="p-5 text-sm text-muted">{t("common.loading")}</Card>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted">
            {t("notificationsPage.empty")}
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((n) => (
              <Card
                key={n.id}
                className={cn(
                  "flex gap-3 p-4",
                  !n.isRead && "border-brand/30 bg-brand-soft/40"
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    n.isRead ? "bg-border" : "bg-danger"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-ink">{n.title}</div>
                  <div className="text-sm text-muted">{n.message}</div>
                  <div className="mt-1 text-xs text-muted">
                    {formatDateTime(n.createdAt)}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </ModuleSection>
    </ModuleWorkspace>
  );
}
