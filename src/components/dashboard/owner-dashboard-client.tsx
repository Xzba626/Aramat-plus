"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney, cn } from "@/lib/utils";
import { DeltaBadge } from "@/components/layout/owner-top-bar";
import type { DashboardPayload } from "@/lib/services/dashboard.service";

const QUICK = [
  { href: "/warehouse", label: "Склад" },
  { href: "/stores", label: "Магазины" },
  { href: "/returns", label: "Возвраты" },
  { href: "/revision", label: "Ревизии" },
  { href: "/analytics", label: "Аналитика" },
  { href: "/users", label: "Пользователи" },
  { href: "/journal", label: "Журнал" },
  { href: "/settings", label: "Настройки" },
];

export function OwnerDashboardClient({
  initial,
  userName,
}: {
  initial: DashboardPayload;
  userName: string;
}) {
  const [data, setData] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refreshStats = useCallback(async () => {
    const res = await fetch("/api/dashboard");
    if (!res.ok) return;
    const next = await res.json();
    setData(next);
  }, []);

  useEffect(() => {
    const stats = setInterval(refreshStats, 30_000);
    const decisions = setInterval(refreshStats, 10_000);
    return () => {
      clearInterval(stats);
      clearInterval(decisions);
    };
  }, [refreshStats]);

  async function decide(
    kind: "DISCOUNT" | "RETURN",
    id: string,
    decision: "APPROVE" | "REJECT"
  ) {
    setBusyId(id);
    const url =
      kind === "DISCOUNT"
        ? `/api/discount-requests/${id}/decision`
        : `/api/returns/${id}/decision`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setBusyId(null);
    if (res.ok) refreshStats();
  }

  const { today, decisionSummary, decisions } = data;

  return (
    <div className="space-y-6">
      <section className="rounded-[16px] border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:p-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand">
          AROMAT PLUS · Командный центр
        </div>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink">
          Добро пожаловать, {userName}
        </h2>
        <p className="mt-1 text-sm text-muted">
          Сначала решения и продажи сегодня — всё остальное в меню слева.
        </p>
      </section>

      {/* Сегодня */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
          Сегодня
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            {
              label: "Продажи сегодня",
              value: formatMoney(today.revenue),
              delta: today.deltas.revenue,
              profit: false,
            },
            {
              label: "Чистая прибыль",
              value: formatMoney(today.profit),
              delta: today.deltas.profit,
              profit: true,
            },
            {
              label: "Количество продаж",
              value: String(today.count),
              delta: today.deltas.count,
              profit: false,
            },
            {
              label: "Продано товаров",
              value: String(Math.round(today.itemsSold * 10) / 10),
              delta: today.deltas.itemsSold,
              profit: false,
            },
            {
              label: "Средний чек",
              value: formatMoney(today.avgCheck),
              delta: today.deltas.avgCheck,
              profit: false,
            },
          ].map((kpi) => (
            <Card key={kpi.label} className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                {kpi.label}
              </div>
              <div
                className={cn(
                  "mt-2 text-xl font-bold tabular-nums sm:text-2xl",
                  kpi.profit ? "text-success" : "text-ink"
                )}
              >
                {kpi.value}
              </div>
              <DeltaBadge
                pct={kpi.delta?.pct ?? 0}
                label={kpi.delta?.label ?? "0%"}
              />
            </Card>
          ))}
        </div>
      </section>

      {/* Требуют моего решения */}
      <section id="decisions">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
            Требуют моего решения
            {decisionSummary.total > 0 ? (
              <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs text-white">
                {decisionSummary.total}
              </span>
            ) : null}
          </h2>
          {decisionSummary.total > 0 ? (
            <p className="text-xs text-muted">
              {decisionSummary.discount ? `· ${decisionSummary.discount} скидки ` : ""}
              {decisionSummary.return ? `· ${decisionSummary.return} возврата ` : ""}
              {decisionSummary.price ? `· ${decisionSummary.price} цены ` : ""}
              {decisionSummary.writeOff ? `· ${decisionSummary.writeOff} списания` : ""}
            </p>
          ) : null}
        </div>

        {decisionSummary.total === 0 ? (
          <Card className="border-success/20 bg-success/5 p-5 text-sm text-success">
            Все задачи обработаны. Новых запросов нет.
          </Card>
        ) : (
          <div className="space-y-3">
            {decisions.map((d) => (
              <Card
                key={`${d.type}-${d.id}`}
                className={cn(
                  "border-l-4 p-4",
                  d.priority === "urgent" ? "border-l-warning" : "border-l-border"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-ink">{d.title}</div>
                    <div className="mt-1 text-xs text-muted">
                      {new Date(d.createdAt).toLocaleString("ru-RU")} · {d.storeName} ·{" "}
                      {d.actorName}
                    </div>
                    <div className="mt-2 text-sm text-ink">{d.products}</div>
                    {d.type === "DISCOUNT" ? (
                      <div className="mt-1 text-sm text-muted">
                        {d.originalTotal != null
                          ? `Было: ${formatMoney(d.originalTotal)} · `
                          : ""}
                        Запрос: {formatMoney(d.amount)}
                        {d.percent != null ? ` (−${d.percent}%)` : ""}
                      </div>
                    ) : (
                      <div className="mt-1 text-sm text-muted">
                        {d.reason || "Причина не указана"} · чек{" "}
                        {d.originalTotal != null ? formatMoney(d.originalTotal) : "—"}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      fullWidth={false}
                      disabled={busyId === d.id}
                      onClick={() => decide(d.type, d.id, "APPROVE")}
                    >
                      Одобрить
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      fullWidth={false}
                      disabled={busyId === d.id}
                      onClick={() => decide(d.type, d.id, "REJECT")}
                    >
                      Отклонить
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Уведомления */}
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            Важные уведомления
          </h2>
          <Card className="divide-y divide-border p-0">
            {data.notifications.length === 0 ? (
              <div className="p-4 text-sm text-muted">Нет важных уведомлений</div>
            ) : (
              data.notifications.map((n) => (
                <Link
                  key={n.id}
                  href={n.href}
                  className="block px-4 py-3 hover:bg-page"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-1 h-2 w-2 shrink-0 rounded-full",
                        n.tone === "danger" && "bg-danger",
                        n.tone === "warning" && "bg-warning",
                        n.tone !== "danger" && n.tone !== "warning" && "bg-info"
                      )}
                    />
                    <div>
                      <div className="text-sm font-semibold text-ink">{n.title}</div>
                      <div className="text-xs text-muted">{n.message}</div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </Card>
          <Link
            href="/notifications"
            className="mt-2 inline-block text-sm font-semibold text-brand hover:underline"
          >
            Показать все
          </Link>
        </section>

        {/* Магазины */}
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            Магазины / точки сегодня
          </h2>
          <div className="space-y-2">
            {data.stores.map((s) => (
              <Link key={s.id} href={`/stores/${s.id}`}>
                <Card className="mb-2 flex items-center justify-between p-4 transition hover:border-brand/30">
                  <div>
                    <div className="font-semibold text-ink">{s.name}</div>
                    <div className="text-xs text-muted">{s.salesCount} продаж</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-ink">
                      {formatMoney(s.revenue)}
                    </div>
                    <div className="text-xs font-semibold text-success">
                      {formatMoney(s.profit)}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
            {data.stores.length === 0 ? (
              <Card className="p-4 text-sm text-muted">Нет магазинов</Card>
            ) : null}
          </div>
        </section>

        {/* Товары */}
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            Товары, требующие внимания
          </h2>
          <div className="space-y-2">
            {data.lowStock.map((p) => (
              <Link key={p.id} href={`/warehouse/${p.productId}`}>
                <Card
                  className={cn(
                    "mb-2 p-4",
                    p.empty && "border-danger/40 bg-danger/5"
                  )}
                >
                  <div className="font-semibold text-ink">{p.name}</div>
                  <div
                    className={cn(
                      "text-sm",
                      p.empty ? "font-semibold text-danger" : "text-muted"
                    )}
                  >
                    {p.empty
                      ? "Нет в наличии"
                      : `Осталось ${p.quantity}${p.unit}`}
                  </div>
                </Card>
              </Link>
            ))}
            {data.lowStock.length === 0 ? (
              <Card className="p-4 text-sm text-muted">Критичных остатков нет</Card>
            ) : null}
          </div>
        </section>

        {/* Действия */}
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            Последние действия
          </h2>
          <Card className="divide-y divide-border p-0">
            {data.recent.map((log) => (
              <div key={log.id} className="px-4 py-3">
                <div className="text-xs text-muted">
                  {new Date(log.createdAt).toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                <div className="text-sm font-semibold text-ink">
                  {log.userName}
                  {log.role ? ` · ${log.role}` : ""}
                </div>
                <div className="text-sm text-muted">
                  {log.action}
                  {log.comment ? ` — ${log.comment}` : ""}
                </div>
              </div>
            ))}
            {data.recent.length === 0 ? (
              <div className="p-4 text-sm text-muted">Пока нет записей</div>
            ) : null}
          </Card>
          <Link
            href="/journal"
            className="mt-2 inline-block text-sm font-semibold text-brand hover:underline"
          >
            Перейти к журналу действий
          </Link>
        </section>
      </div>

      {/* Быстрые переходы */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
          Быстрые переходы
        </h2>
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className="rounded-xl bg-brand-soft px-4 py-2.5 text-sm font-semibold text-brand ring-1 ring-brand/10 hover:bg-brand hover:text-white"
            >
              {q.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
