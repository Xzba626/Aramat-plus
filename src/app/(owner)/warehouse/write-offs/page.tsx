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
import { useI18n } from "@/components/i18n/i18n-provider";
import { MOCK_WRITE_OFFS } from "@/lib/ui-mocks";

const REASON_VALUES = ["DEFECT", "DAMAGED", "EXPIRED", "LOSS", "OTHER"] as const;

type Row = (typeof MOCK_WRITE_OFFS)[number] & { reasonValue?: string };

export default function WriteOffsPage() {
  const { toast } = useToast();
  const { t, formatDate, formatTime } = useI18n();
  const [rows, setRows] = useState<Row[]>(MOCK_WRITE_OFFS);
  const [q, setQ] = useState("");
  const [reasonFilter, setReasonFilter] = useState("ALL");

  const filtered = rows.filter((r) => {
    const matchQ =
      !q.trim() ||
      `${r.product} ${r.batch} ${r.actor}`.toLowerCase().includes(q.toLowerCase());
    const matchR =
      reasonFilter === "ALL" ||
      r.reasonValue === reasonFilter ||
      r.reason === reasonFilter;
    return matchQ && matchR;
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const reasonValue = String(fd.get("reason"));
    const now = new Date();
    const row: Row = {
      id: `wo-${Date.now()}`,
      date: formatDate(now),
      time: formatTime(now),
      product: String(fd.get("product")),
      batch: String(fd.get("batch") || "—"),
      qty: `${fd.get("qty")} ${t("warehouse.unitMl")}`,
      reason: t("wh.actionWriteOff"),
      reasonValue,
      actor: t("common.seller"),
    };
    setRows((prev) => [row, ...prev]);
    toast(t("wh.writeOffConfirm"));
    e.currentTarget.reset();
  }

  const todayStr = formatDate(new Date());

  return (
    <ModuleWorkspace
      title={t("wh.writeOffTitle")}
      subtitle={t("wh.actionWriteOff")}
      kpis={[
        { label: t("journalPage.loaded"), value: String(rows.length) },
        {
          label: t("dashboard.today"),
          value: String(rows.filter((r) => r.date === todayStr).length),
        },
        {
          label: t("wh.centralWarehouse"),
          hint: t("dashboard.stockOnHand"),
          value: t("wh.centralWarehouse"),
        },
      ]}
      actions={
        <Link
          href="/warehouse/history"
          className="text-sm font-semibold text-brand hover:underline"
        >
          {t("wh.historyTitle")}
        </Link>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
        <ModuleSection title={t("wh.writeOffTitle")}>
          <Card className="p-5">
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <FieldLabel>{t("wh.colName")}</FieldLabel>
                <input
                  name="product"
                  required
                  className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <FieldLabel>{t("wh.batchesTitle")}</FieldLabel>
                <input
                  name="batch"
                  className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel>{t("warehouse.productBatchQty")}</FieldLabel>
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
                  <FieldLabel>{t("warehouse.productBatchNotes")}</FieldLabel>
                  <select
                    name="reason"
                    required
                    className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      {t("warehouse.productBatchNotes")}
                    </option>
                    {REASON_VALUES.map((value) => (
                      <option key={value} value={value}>
                        {t("wh.actionWriteOff")} · {value}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <FieldLabel>{t("warehouse.productBatchNotes")}</FieldLabel>
                <textarea
                  name="comment"
                  rows={3}
                  className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                />
              </div>
              <Button type="submit" fullWidth={false}>
                {t("wh.writeOffConfirm")}
              </Button>
            </form>
          </Card>
        </ModuleSection>

        <ModuleSection title={t("wh.historyTitle")}>
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("common.search")}
              className="min-w-[200px] flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm"
            />
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="ALL">{t("wh.filterAll")}</option>
              {REASON_VALUES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <Card className="overflow-hidden p-0">
            <div className="max-h-[520px] overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-page text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{t("journalPage.colDate")}</th>
                    <th className="px-4 py-3 font-semibold">{t("wh.colName")}</th>
                    <th className="px-4 py-3 font-semibold">{t("wh.batchesTitle")}</th>
                    <th className="px-4 py-3 font-semibold">{t("wh.colQty")}</th>
                    <th className="px-4 py-3 font-semibold">{t("warehouse.productBatchNotes")}</th>
                    <th className="px-4 py-3 font-semibold">{t("journalPage.colUser")}</th>
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
                {t("journalPage.empty")}
              </div>
            ) : null}
          </Card>
        </ModuleSection>
      </div>
    </ModuleWorkspace>
  );
}
