"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { useToast } from "@/components/ui/toast";
import { MOCK_WRITE_OFFS } from "@/lib/ui-mocks";

const REASONS = [
  { value: "DEFECT", label: "Брак" },
  { value: "DAMAGED", label: "Повреждение" },
  { value: "EXPIRED", label: "Просрочка" },
  { value: "LOSS", label: "Потеря" },
  { value: "OTHER", label: "Другое" },
];

type Row = (typeof MOCK_WRITE_OFFS)[number];

export default function WriteOffsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>(MOCK_WRITE_OFFS);
  const [q, setQ] = useState("");
  const [reasonFilter, setReasonFilter] = useState("ALL");

  const filtered = rows.filter((r) => {
    const matchQ =
      !q.trim() ||
      `${r.product} ${r.batch} ${r.actor}`.toLowerCase().includes(q.toLowerCase());
    const matchR =
      reasonFilter === "ALL" ||
      r.reason === REASONS.find((x) => x.value === reasonFilter)?.label;
    return matchQ && matchR;
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const reasonValue = String(fd.get("reason"));
    const reasonLabel =
      REASONS.find((r) => r.value === reasonValue)?.label ?? reasonValue;
    const now = new Date();
    const row: Row = {
      id: `wo-${Date.now()}`,
      date: now.toLocaleDateString("ru-RU"),
      time: now.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      product: String(fd.get("product")),
      batch: String(fd.get("batch") || "—"),
      qty: `${fd.get("qty")} мл`,
      reason: reasonLabel,
      actor: "Вы",
    };
    setRows((prev) => [row, ...prev]);
    toast("Списание добавлено в список");
    e.currentTarget.reset();
  }

  return (
    <ModuleWorkspace
      title="Списание"
      subtitle="Брак, просрочка, повреждение, потеря. Каждая операция остаётся в истории склада."
      kpis={[
        { label: "Записей", value: String(rows.length) },
        {
          label: "Сегодня",
          value: String(
            rows.filter((r) => r.date === new Date().toLocaleDateString("ru-RU"))
              .length
          ),
        },
        {
          label: "Тип",
          value: "Со склада",
          hint: "Уменьшает центральный остаток",
        },
      ]}
      actions={
        <Link
          href="/warehouse/history"
          className="text-sm font-semibold text-brand hover:underline"
        >
          История склада
        </Link>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
        <ModuleSection title="Новое списание">
          <Card className="p-5">
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <FieldLabel>Товар</FieldLabel>
                <input
                  name="product"
                  required
                  placeholder="Dior Sauvage"
                  className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <FieldLabel>Партия</FieldLabel>
                <input
                  name="batch"
                  placeholder="Партия №12"
                  className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel>Количество (мл)</FieldLabel>
                  <input
                    name="qty"
                    type="number"
                    min="0.001"
                    step="0.001"
                    required
                    className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <FieldLabel>Причина</FieldLabel>
                  <select
                    name="reason"
                    required
                    className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Выберите причину
                    </option>
                    {REASONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <FieldLabel>Комментарий</FieldLabel>
                <textarea
                  name="comment"
                  rows={3}
                  className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                  placeholder="Что произошло"
                />
              </div>
              <Button type="submit" fullWidth={false}>
                Зафиксировать списание
              </Button>
            </form>
          </Card>
        </ModuleSection>

        <ModuleSection title="История списаний">
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск: товар, партия, кто…"
              className="min-w-[200px] flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm"
            />
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="ALL">Все причины</option>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <Card className="overflow-hidden p-0">
            <div className="max-h-[520px] overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-page text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Дата</th>
                    <th className="px-4 py-3 font-semibold">Товар</th>
                    <th className="px-4 py-3 font-semibold">Партия</th>
                    <th className="px-4 py-3 font-semibold">Кол-во</th>
                    <th className="px-4 py-3 font-semibold">Причина</th>
                    <th className="px-4 py-3 font-semibold">Кто</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3 tabular-nums text-muted">
                        {r.date}
                        <span className="block text-xs">{r.time}</span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-ink">
                        {r.product}
                      </td>
                      <td className="px-4 py-3 text-muted">{r.batch}</td>
                      <td className="px-4 py-3 tabular-nums text-ink">
                        {r.qty}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">
                          {r.reason}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted">{r.actor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted">
                Нет записей по фильтру
              </div>
            ) : null}
          </Card>
        </ModuleSection>
      </div>
    </ModuleWorkspace>
  );
}
