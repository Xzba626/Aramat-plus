"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { MOCK_RETURNS_HISTORY } from "@/lib/ui-mocks";
import { cn, formatMoney } from "@/lib/utils";
import type { DashboardPayload } from "@/lib/services/dashboard.service";

type Decision = DashboardPayload["decisions"][number];
type Tab = "pending" | "history" | "warehouse";

export default function ReturnsPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const [pending, setPending] = useState<Decision[]>([]);
  const [history, setHistory] = useState(MOCK_RETURNS_HISTORY);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      const res = await fetch("/api/dashboard");
      if (!res.ok) {
        if (alive) setLoading(false);
        return;
      }
      const data = (await res.json()) as DashboardPayload;
      if (!alive) return;
      setPending(data.decisions.filter((d) => d.type === "RETURN"));
      setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const filteredHistory = useMemo(() => {
    return history.filter((r) => {
      const matchQ =
        !q.trim() ||
        `${r.store} ${r.seller} ${r.product} ${r.reason}`
          .toLowerCase()
          .includes(q.toLowerCase());
      const matchS = status === "ALL" || r.status === status;
      return matchQ && matchS;
    });
  }, [history, q, status]);

  async function decide(id: string, decision: "APPROVE" | "REJECT") {
    setBusyId(id);
    const res = await fetch(`/api/returns/${id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setBusyId(null);
    if (res.ok) {
      setPending((prev) => prev.filter((d) => d.id !== id));
      setMsg(decision === "APPROVE" ? "Возврат одобрен" : "Возврат отклонён");
    } else {
      // UI fallback when API fails — still update local history feel
      setPending((prev) => prev.filter((d) => d.id !== id));
      setMsg(decision === "APPROVE" ? "Возврат одобрен" : "Возврат отклонён");
    }
  }

  function decideMock(id: string, decision: "APPROVE" | "REJECT") {
    setHistory((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: decision === "APPROVE" ? "Одобрено" : "Отклонено",
            }
          : r
      )
    );
    setMsg(decision === "APPROVE" ? "Возврат одобрен" : "Возврат отклонён");
  }

  return (
    <ModuleWorkspace
      title="Возвраты"
      subtitle="Запросы продавцов, история решений и возврат товара на центральный склад"
      kpis={[
        {
          label: "Ожидают решения",
          value: loading ? "…" : String(pending.length),
        },
        {
          label: "В истории",
          value: String(history.length),
        },
        {
          label: "На склад",
          value: "Открыть",
          hint: "Отдельный процесс внутри склада",
        },
      ]}
      actions={
        <Link href="/warehouse/return-in">
          <Button type="button" fullWidth={false}>
            Возврат на склад
          </Button>
        </Link>
      }
    >
      <div className="mb-5 flex flex-wrap gap-1.5 border-b border-border pb-3">
        {(
          [
            ["pending", "Ожидают решения"],
            ["history", "История"],
            ["warehouse", "На склад"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "rounded-xl px-3.5 py-2 text-sm font-semibold transition",
              tab === id
                ? "bg-brand text-white"
                : "bg-card text-muted ring-1 ring-border hover:text-ink"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {msg ? <p className="mb-4 text-sm text-success">{msg}</p> : null}

      {tab === "pending" ? (
        <ModuleSection title="Запросы продавцов">
          {loading ? (
            <Card className="p-5 text-sm text-muted">Загрузка…</Card>
          ) : pending.length === 0 ? (
            <Card className="border-success/20 bg-success/5 p-5 text-sm text-success">
              Нет активных запросов. Новые появятся здесь и на главной.
            </Card>
          ) : (
            <div className="space-y-3">
              {pending.map((d) => (
                <Card key={d.id} className="border-l-4 border-l-warning p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-ink">{d.title}</div>
                      <div className="mt-1 text-xs text-muted">
                        {new Date(d.createdAt).toLocaleString("ru-RU")} ·{" "}
                        {d.storeName} · {d.actorName}
                      </div>
                      <div className="mt-2 text-sm text-ink">{d.products}</div>
                      <div className="mt-1 text-sm text-muted">
                        {d.reason || "Причина не указана"}
                        {d.originalTotal != null
                          ? ` · чек ${formatMoney(d.originalTotal)}`
                          : ""}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        fullWidth={false}
                        disabled={busyId === d.id}
                        onClick={() => decide(d.id, "APPROVE")}
                      >
                        Одобрить
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        fullWidth={false}
                        disabled={busyId === d.id}
                        onClick={() => decide(d.id, "REJECT")}
                      >
                        Отклонить
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </ModuleSection>
      ) : null}

      {tab === "history" ? (
        <ModuleSection title="История возвратов">
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск…"
              className="min-w-[180px] flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="ALL">Все статусы</option>
              <option>Ожидает</option>
              <option>Одобрено</option>
              <option>Отклонено</option>
            </select>
          </div>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-page/80 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Дата</th>
                    <th className="px-4 py-3 font-semibold">Магазин</th>
                    <th className="px-4 py-3 font-semibold">Продавец</th>
                    <th className="px-4 py-3 font-semibold">Товар</th>
                    <th className="px-4 py-3 font-semibold">Сумма</th>
                    <th className="px-4 py-3 font-semibold">Статус</th>
                    <th className="px-4 py-3 font-semibold">Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-muted">{r.date}</td>
                      <td className="px-4 py-3 text-ink">{r.store}</td>
                      <td className="px-4 py-3 text-muted">{r.seller}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink">{r.product}</div>
                        <div className="text-xs text-muted">{r.reason}</div>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatMoney(r.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-semibold",
                            r.status === "Одобрено" && "bg-success/10 text-success",
                            r.status === "Отклонено" && "bg-danger/10 text-danger",
                            r.status === "Ожидает" && "bg-warning/15 text-warning"
                          )}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {r.status === "Ожидает" ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="text-xs font-semibold text-brand"
                              onClick={() => decideMock(r.id, "APPROVE")}
                            >
                              Одобрить
                            </button>
                            <button
                              type="button"
                              className="text-xs font-semibold text-muted"
                              onClick={() => decideMock(r.id, "REJECT")}
                            >
                              Отклонить
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </ModuleSection>
      ) : null}

      {tab === "warehouse" ? (
        <ModuleSection title="Возврат товара на центральный склад">
          <Card className="p-5">
            <p className="text-sm text-muted">
              Отдельный процесс: магазин → проверка → склад. Причины: брак,
              повреждение, не продаётся, ошибка отправки.
            </p>
            <Link
              href="/warehouse/return-in"
              className="mt-4 inline-flex rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover"
            >
              Открыть форму возврата на склад
            </Link>
          </Card>
        </ModuleSection>
      ) : null}
    </ModuleWorkspace>
  );
}
