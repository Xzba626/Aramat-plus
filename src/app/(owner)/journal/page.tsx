"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { cn } from "@/lib/utils";

type LogRow = {
  id: string;
  createdAt: string;
  userName: string | null;
  role: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  comment: string | null;
  result: string | null;
};

type Tab = "all" | "warehouse" | "sales" | "users";

export default function JournalPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      const res = await fetch("/api/journal");
      const data = await res.json();
      if (!alive) return;
      if (res.ok && Array.isArray(data)) setRows(data);
      setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((log) => {
      const blob =
        `${log.action} ${log.entityType} ${log.userName ?? ""} ${log.comment ?? ""}`.toLowerCase();
      const matchQ = !q.trim() || blob.includes(q.toLowerCase());
      if (!matchQ) return false;
      if (tab === "warehouse")
        return /warehouse|batch|transfer|stock|product|return|write/i.test(blob);
      if (tab === "sales")
        return /sale|discount|pos|payment/i.test(blob);
      if (tab === "users")
        return /user|password|login|role/i.test(blob);
      return true;
    });
  }, [rows, tab, q]);

  return (
    <ModuleWorkspace
      title="Журнал действий"
      subtitle="Серверный лог системы. Записи не удаляются."
      kpis={[
        {
          label: "Всего загружено",
          value: loading ? "…" : String(rows.length),
        },
        {
          label: "На экране",
          value: loading ? "…" : String(filtered.length),
        },
        {
          label: "Удаление",
          value: "Запрещено",
          hint: "История сохраняется всегда",
        },
      ]}
    >
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(
          [
            ["all", "Все"],
            ["warehouse", "Склад"],
            ["sales", "Продажи"],
            ["users", "Пользователи"],
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
        placeholder="Поиск: действие, пользователь, объект…"
        className="mb-4 w-full max-w-lg rounded-xl border border-border bg-card px-3 py-2 text-sm"
      />

      <ModuleSection title="Лог">
        {loading ? (
          <Card className="p-5 text-sm text-muted">Загрузка…</Card>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted">
            Нет записей по фильтру
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-page/80 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Дата</th>
                    <th className="px-4 py-3 font-semibold">Время</th>
                    <th className="px-4 py-3 font-semibold">Пользователь</th>
                    <th className="px-4 py-3 font-semibold">Роль</th>
                    <th className="px-4 py-3 font-semibold">Действие</th>
                    <th className="px-4 py-3 font-semibold">Объект</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log) => {
                    const d = new Date(log.createdAt);
                    return (
                      <tr
                        key={log.id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-4 py-3 tabular-nums text-muted">
                          {d.toLocaleDateString("ru-RU")}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted">
                          {d.toLocaleTimeString("ru-RU", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3 font-semibold text-ink">
                          {log.userName ?? "Система"}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {log.role ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-ink">
                          {log.action}
                          {log.comment ? (
                            <span className="block text-xs text-muted">
                              {log.comment}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {log.entityType}
                          {log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </ModuleSection>
    </ModuleWorkspace>
  );
}
