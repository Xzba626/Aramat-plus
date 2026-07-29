"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { MOCK_REVISIONS } from "@/lib/ui-mocks";
import { cn } from "@/lib/utils";

type Row = (typeof MOCK_REVISIONS)[number];
type Tab = "list" | "new" | "owner-view";

export default function RevisionPage() {
  const [tab, setTab] = useState<Tab>("list");
  const [rows, setRows] = useState<Row[]>(MOCK_REVISIONS);
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [msg, setMsg] = useState("");

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchQ =
        !q.trim() ||
        `${r.store} ${r.createdBy}`.toLowerCase().includes(q.toLowerCase());
      const matchS = status === "ALL" || r.status === status;
      return matchQ && matchS;
    });
  }, [rows, q, status]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  function startRevision(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const now = new Date();
    const row: Row = {
      id: `rev-${Date.now()}`,
      date: now.toLocaleDateString("ru-RU"),
      store: String(fd.get("store")),
      createdBy: "Менеджер",
      status: "В процессе",
      statusTone: "info",
      expected: "—",
      actual: "0 мл",
      diff: "—",
    };
    setRows((prev) => [row, ...prev]);
    setSelectedId(row.id);
    setTab("list");
    setMsg("Ревизия создана. Менеджер вводит фактический подсчёт без ожидаемого остатка.");
    (e.target as HTMLFormElement).reset();
  }

  function saveCount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const fd = new FormData(e.currentTarget);
    const actual = `${fd.get("actual")} мл`;
    setRows((prev) =>
      prev.map((r) =>
        r.id === selected.id
          ? {
              ...r,
              actual,
              status: "На утверждении",
              statusTone: "warning" as const,
              expected: "500 мл",
              diff: "−50 мл",
            }
          : r
      )
    );
    setMsg("Подсчёт сохранён. Владелец увидит сравнение «должно / фактически / расхождение».");
    setTab("owner-view");
  }

  function approve() {
    if (!selected) return;
    setRows((prev) =>
      prev.map((r) =>
        r.id === selected.id
          ? { ...r, status: "Утверждена", statusTone: "success" as const }
          : r
      )
    );
    setMsg("Ревизия утверждена");
  }

  return (
    <ModuleWorkspace
      title="Ревизии"
      subtitle="Менеджер считает факт. Ожидаемый остаток и недостачу видит только владелец."
      tabs={[
        { id: "list", label: "Список" },
        { id: "new", label: "Новая ревизия" },
        { id: "owner-view", label: "Вид владельца" },
      ].map((t) => ({
        ...t,
        href: undefined,
      }))}
      activeTab={tab}
      kpis={[
        {
          label: "В процессе",
          value: String(rows.filter((r) => r.status === "В процессе").length),
        },
        {
          label: "На утверждении",
          value: String(rows.filter((r) => r.status === "На утверждении").length),
        },
        {
          label: "Утверждено",
          value: String(rows.filter((r) => r.status === "Утверждена").length),
        },
      ]}
      actions={
        <Link href="/stores">
          <Button type="button" variant="secondary" fullWidth={false}>
            Магазины
          </Button>
        </Link>
      }
    >
      {/* Custom tab buttons — ModuleTabs needs href; use local controls */}
      <div className="mb-5 flex flex-wrap gap-1.5 border-b border-border pb-3">
        {(
          [
            ["list", "Список"],
            ["new", "Новая ревизия"],
            ["owner-view", "Вид владельца"],
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

      {tab === "new" ? (
        <ModuleSection title="Запуск ревизии">
          <Card className="max-w-lg p-5">
            <form onSubmit={startRevision} className="space-y-3">
              <div>
                <FieldLabel>Магазин</FieldLabel>
                <select
                  name="store"
                  required
                  className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                  defaultValue="Магазин №1 Душанбе"
                >
                  <option>Магазин №1 Душанбе</option>
                  <option>Магазин №2 Худжанд</option>
                </select>
              </div>
              <div>
                <FieldLabel>Комментарий</FieldLabel>
                <textarea
                  name="comment"
                  rows={2}
                  className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                  placeholder="Плановая / внезапная"
                />
              </div>
              <Button type="submit" fullWidth={false}>
                Начать ревизию
              </Button>
            </form>
          </Card>
        </ModuleSection>
      ) : null}

      {tab === "list" ? (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по магазину или менеджеру…"
              className="min-w-[200px] flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="ALL">Все статусы</option>
              <option>В процессе</option>
              <option>На утверждении</option>
              <option>Утверждена</option>
            </select>
          </div>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-page/80 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Дата</th>
                    <th className="px-4 py-3 font-semibold">Магазин</th>
                    <th className="px-4 py-3 font-semibold">Создал</th>
                    <th className="px-4 py-3 font-semibold">Статус</th>
                    <th className="px-4 py-3 font-semibold">Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-muted">{r.date}</td>
                      <td className="px-4 py-3 font-semibold text-ink">{r.store}</td>
                      <td className="px-4 py-3 text-muted">{r.createdBy}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-semibold",
                            r.statusTone === "success" && "bg-success/10 text-success",
                            r.statusTone === "warning" && "bg-warning/15 text-warning",
                            r.statusTone === "info" && "bg-info/10 text-info"
                          )}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="text-sm font-semibold text-brand hover:underline"
                          onClick={() => {
                            setSelectedId(r.id);
                            setTab(
                              r.status === "В процессе" ? "list" : "owner-view"
                            );
                            if (r.status === "В процессе") {
                              setSelectedId(r.id);
                            }
                          }}
                        >
                          Открыть
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {selected?.status === "В процессе" ? (
            <ModuleSection title={`Подсчёт · ${selected.store}`}>
              <Card className="max-w-lg border-l-4 border-l-info p-5">
                <p className="mb-3 text-sm text-muted">
                  Экран менеджера: виден только фактический подсчёт. Ожидаемый остаток скрыт.
                </p>
                <form onSubmit={saveCount} className="space-y-3">
                  <div>
                    <FieldLabel>Товар</FieldLabel>
                    <input
                      defaultValue="Dior Sauvage"
                      className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                      readOnly
                    />
                  </div>
                  <div>
                    <FieldLabel>Фактически посчитано (мл)</FieldLabel>
                    <input
                      name="actual"
                      type="number"
                      required
                      defaultValue={450}
                      className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                    />
                  </div>
                  <Button type="submit" fullWidth={false}>
                    Сохранить и отправить владельцу
                  </Button>
                </form>
              </Card>
            </ModuleSection>
          ) : null}
        </>
      ) : null}

      {tab === "owner-view" ? (
        <ModuleSection title="Сравнение для владельца">
          {!selected ? (
            <Card className="p-5 text-sm text-muted">Выберите ревизию в списке</Card>
          ) : (
            <div className="space-y-4">
              <Card className="p-4">
                <div className="text-sm font-bold text-ink">{selected.store}</div>
                <div className="mt-1 text-xs text-muted">
                  {selected.date} · {selected.createdBy} · {selected.status}
                </div>
              </Card>
              <Card className="overflow-hidden p-0">
                <div className="grid grid-cols-3 divide-x divide-border text-center">
                  <div className="p-5">
                    <div className="text-xs font-semibold uppercase text-muted">
                      Должно быть
                    </div>
                    <div className="mt-2 text-xl font-bold text-ink">
                      {selected.expected}
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="text-xs font-semibold uppercase text-muted">
                      Фактически
                    </div>
                    <div className="mt-2 text-xl font-bold text-ink">
                      {selected.actual}
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="text-xs font-semibold uppercase text-muted">
                      Расхождение
                    </div>
                    <div className="mt-2 text-xl font-bold text-danger">
                      {selected.diff}
                    </div>
                  </div>
                </div>
              </Card>
              {selected.status === "На утверждении" ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" fullWidth={false} onClick={approve}>
                    Утвердить
                  </Button>
                  <Button type="button" variant="secondary" fullWidth={false}>
                    Вернуть на пересчёт
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </ModuleSection>
      ) : null}
    </ModuleWorkspace>
  );
}
