"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const MOCK = [
  {
    id: "1",
    title: "Скидка одобрена",
    message: "Dior Sauvage −10% · Магазин №1",
    time: "Сегодня 14:20",
    unread: true,
    kind: "action" as const,
  },
  {
    id: "2",
    title: "Низкий остаток",
    message: "Chanel Bleu · осталось 25 мл",
    time: "Сегодня 11:05",
    unread: true,
    kind: "stock" as const,
  },
  {
    id: "3",
    title: "Возврат отклонён",
    message: "Запрос по чеку №1842",
    time: "Вчера 18:40",
    unread: false,
    kind: "action" as const,
  },
];

type Tab = "all" | "unread" | "stock" | "actions";

export default function PosNotificationsPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [items, setItems] = useState(MOCK);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return items.filter((n) => {
      const matchQ =
        !q.trim() ||
        `${n.title} ${n.message}`.toLowerCase().includes(q.toLowerCase());
      if (!matchQ) return false;
      if (tab === "unread") return n.unread;
      if (tab === "stock") return n.kind === "stock";
      if (tab === "actions") return n.kind === "action";
      return true;
    });
  }, [items, tab, q]);

  return (
    <div className="space-y-4 pb-20">
      <div className="text-center">
        <h1 className="text-xl font-bold text-ink">Уведомления</h1>
        <p className="mt-1 text-sm text-muted">
          Ответы по скидкам, возвратам и остаткам магазина
        </p>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Поиск…"
        className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm"
      />

      <div className="flex gap-1.5 overflow-x-auto">
        {(
          [
            ["all", "Все"],
            ["unread", "Новые"],
            ["stock", "Остатки"],
            ["actions", "Решения"],
          ] as const
        ).map(([id, label]) => (
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
            {label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="w-full text-sm font-semibold text-brand"
        onClick={() => setItems((prev) => prev.map((n) => ({ ...n, unread: false })))}
      >
        Отметить все прочитанными
      </button>

      <div className="space-y-2">
        {filtered.map((n) => (
          <Card
            key={n.id}
            className={cn("p-4 text-left", n.unread && "border-brand/30 bg-brand-soft/20")}
          >
            <div className="text-sm font-semibold text-ink">{n.title}</div>
            <div className="mt-1 text-sm text-muted">{n.message}</div>
            <div className="mt-2 text-xs text-muted">{n.time}</div>
          </Card>
        ))}
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Нет уведомлений</p>
        ) : null}
      </div>
    </div>
  );
}
