"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Role } from "@prisma/client";
import { isOwnerClass } from "@/lib/rbac";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage, labelWriteOffReason } from "@/lib/i18n/labels";
import { decimalToNumber } from "@/lib/utils";

const REASON_VALUES = [
  "SPOILED",
  "BROKEN",
  "TESTER",
  "STOLEN",
  "LOSS",
  "EXPIRED",
  "OTHER",
] as const;

type StockItem = {
  productId: string;
  name: string;
  quantity: number;
  unit: string;
};

type WriteOffRow = {
  id: string;
  createdAt: string;
  actor: string;
  reason: string;
  reasonCode?: string | null;
  itemCount: number;
  totalCost: number;
};

export default function WriteOffsPage() {
  const { toast } = useToast();
  const { t, formatDateTime, formatMoney } = useI18n();
  const { data: session } = useSession();
  const isOwner = isOwnerClass(session?.user?.role);
  const [rows, setRows] = useState<WriteOffRow[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [productId, setProductId] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const [woRes, stockRes] = await Promise.all([
      fetch("/api/warehouse/write-offs"),
      fetch("/api/warehouse/stock"),
    ]);
    const wo = await woRes.json();
    const st = await stockRes.json();
    if (woRes.ok && Array.isArray(wo)) setRows(wo);
    if (stockRes.ok && Array.isArray(st.items)) {
      setStock(
        st.items.map(
          (b: {
            productId: string;
            quantity: unknown;
            product: {
              name: string;
              unit?: { symbol: string } | null;
            };
          }) => ({
            productId: b.productId,
            name: b.product.name,
            quantity: decimalToNumber(b.quantity as never),
            unit: b.product.unit?.symbol ?? "",
          })
        )
      );
    }
  }, []);

  useEffect(() => {
    if (!isOwner) return;
    reload();
  }, [isOwner, reload]);

  const filtered = useMemo(() => {
    return rows.filter(
      (r) =>
        !q.trim() ||
        `${r.reason} ${r.actor}`.toLowerCase().includes(q.toLowerCase())
    );
  }, [rows, q]);

  if (!isOwner) {
    return (
      <ModuleWorkspace
        title={t("wh.writeOffTitle")}
        subtitle={t("wh.actionWriteOff")}
      >
        <EmptyState title={t("roles.ownerOnly")} />
      </ModuleWorkspace>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const pid = String(fd.get("productId") || productId);
    const qty = Number(fd.get("qty"));
    const reasonCode = String(fd.get("reason"));
    const comment = String(fd.get("comment") || "").trim();
    if (!pid || !qty) return;

    setBusy(true);
    setError("");
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `wo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const res = await fetch("/api/warehouse/write-offs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reasonCode: reasonCode,
        comment: comment || null,
        idempotencyKey,
        items: [{ productId: pid, quantity: qty }],
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    toast(t("wh.writeOffConfirm"));
    e.currentTarget.reset();
    setProductId("");
    await reload();
  }

  return (
    <ModuleWorkspace
      title={t("wh.writeOffTitle")}
      subtitle={t("wh.actionWriteOff")}
      kpis={[
        { label: t("journalPage.loaded"), value: String(rows.length) },
        {
          label: t("wh.centralWarehouse"),
          hint: t("dashboard.stockHint"),
          value: t("storesPage.kindsOnHand", {
            sku: stock.length,
            units: Math.round(
              stock.reduce((n, s) => n + (Number.isFinite(s.quantity) ? s.quantity : 0), 0) * 1000
            ) / 1000,
          }),
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
                <select
                  name="productId"
                  required
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                >
                  <option value="">{t("common.search")}</option>
                  {stock.map((s) => (
                    <option key={s.productId} value={s.productId}>
                      {s.name} ({s.quantity} {s.unit})
                    </option>
                  ))}
                </select>
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
                  <FieldLabel>{t("wh.writeOffReason")}</FieldLabel>
                  <select
                    name="reason"
                    required
                    className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      {t("wh.writeOffReasonPlaceholder")}
                    </option>
                    {REASON_VALUES.map((value) => (
                      <option key={value} value={value}>
                        {labelWriteOffReason(value, t)}
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
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <Button type="submit" fullWidth={false} disabled={busy}>
                {busy ? t("common.loading") : t("wh.writeOffConfirm")}
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
          </div>
          <Card className="overflow-hidden p-0">
            <div className="max-h-[520px] overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-page text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">
                      {t("journalPage.colDate")}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t("warehouse.productBatchNotes")}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t("wh.colQty")}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t("journalPage.colUser")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3 tabular-nums text-muted">
                        {formatDateTime(r.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink">
                          {labelWriteOffReason(r.reasonCode ?? r.reason, t)}
                        </div>
                        {r.reasonCode &&
                        r.reason &&
                        r.reason !== r.reasonCode ? (
                          <div className="text-xs text-muted">{r.reason}</div>
                        ) : null}
                        <div className="text-xs text-muted">
                          {formatMoney(r.totalCost)}
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink">
                        {r.itemCount}
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
