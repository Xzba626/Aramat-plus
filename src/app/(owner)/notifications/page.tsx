"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { cn } from "@/lib/utils";

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
        return /stock|остат|товар|парти/i.test(text);
      if (tab === "actions")
        return /скидк|возврат|ревиз|запрос|решен/i.test(text);
      return true;
    });
  }, [items, tab, q]);

  const unread = items.filter((n) => !n.isRead).length;

  return (
    <ModuleWorkspace
      title="Уведомления"
      subtitle="Остатки, партии, запросы и действия, требующие внимания"
      kpis={[
        { label: "Всего", value: loading ? "…" : String(items.length) },
        { label: "Непрочитанные", value: loading ? "…" : String(unread) },
        {
          label: "На экране",
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
          Отметить все прочитанными
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(
          [
            ["all", "Все"],
            ["unread", "Непрочитанные"],
            ["stock", "Остатки"],
            ["actions", "Требуют действия"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "rounded-xl px-3.5 py-2 text-sm font-semibold",
              tab === id
                ? "bg-brand text-white"
                : "bg-card text-muted ring-1 ring-border"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Поиск по уведомлениям…"
        className="mb-4 w-full max-w-md rounded-xl border border-border bg-card px-3 py-2 text-sm"
      />

      <ModuleSection title="Лента">
        {loading ? (
          <Card className="p-5 text-sm text-muted">Загрузка…</Card>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted">
            Нет уведомлений по выбранному фильтру
          </Card>
        ) : (
          <Card className="divide-y divide-border p-0">
            {filtered.map((n) => (
              <div
                key={n.id}
                className={cn("px-4 py-3", !n.isRead && "bg-brand-soft/30")}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      n.isRead ? "bg-border" : "bg-brand"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink">{n.title}</div>
                    <div className="mt-0.5 text-sm text-muted">{n.message}</div>
                    <div className="mt-1 text-xs text-muted">
                      {new Date(n.createdAt).toLocaleString("ru-RU")}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </Card>
        )}
      </ModuleSection>
    </ModuleWorkspace>
  );
}
