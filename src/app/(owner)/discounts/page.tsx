"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Role } from "@prisma/client";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

type DiscountRow = {
  id: string;
  status: string;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  percent: number | null;
  reason: string | null;
  reviewNote: string | null;
  storeName: string;
  requesterName: string;
  reviewerName: string | null;
  products: string;
  createdAt: string;
  reviewedAt: string | null;
};

type Tab = "pending" | "history" | "gifts";

type GiftRuleRow = {
  id: string;
  name: string;
  productId: string | null;
  productName: string | null;
  minQuantity: number | null;
  giftProductId: string;
  giftProductName: string;
  giftQuantity: number;
  isActive: boolean;
};

type ProductOption = { id: string; name: string };

export default function DiscountsPage() {
  const { t, formatMoney, formatDateTime } = useI18n();
  const { data: session } = useSession();
  const canDecide = session?.user?.role === Role.OWNER;

  const [tab, setTab] = useState<Tab>("pending");
  const [rows, setRows] = useState<DiscountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [giftRules, setGiftRules] = useState<GiftRuleRow[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [giftForm, setGiftForm] = useState({
    productId: "",
    minQuantity: "1",
    giftProductId: "",
    isActive: true,
  });
  const [giftBusy, setGiftBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/discount-requests");
    const data = await res.json();
    if (res.ok && Array.isArray(data)) {
      setRows(data);
    } else if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
    }
    setLoading(false);
  }, [t]);

  const reloadGifts = useCallback(async () => {
    const [rulesRes, productsRes] = await Promise.all([
      fetch("/api/gift-rules"),
      fetch("/api/products?status=active"),
    ]);
    const rulesData = await rulesRes.json();
    const productsData = await productsRes.json();
    if (rulesRes.ok && Array.isArray(rulesData)) setGiftRules(rulesData);
    if (productsRes.ok && Array.isArray(productsData)) {
      setProducts(productsData.map((p: { id: string; name: string }) => ({
        id: p.id,
        name: p.name,
      })));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (tab === "gifts" && canDecide) reloadGifts();
  }, [tab, canDecide, reloadGifts]);

  const pending = useMemo(
    () => rows.filter((r) => r.status === "PENDING"),
    [rows]
  );
  const history = useMemo(
    () =>
      rows.filter((r) => r.status === "APPROVED" || r.status === "REJECTED"),
    [rows]
  );

  async function decide(id: string, decision: "APPROVE" | "REJECT") {
    setBusyId(id);
    setError("");
    const res = await fetch(`/api/discount-requests/${id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    setMsg(
      decision === "APPROVE"
        ? t("discountsPage.approved")
        : t("discountsPage.rejected")
    );
    await reload();
  }

  async function createGiftRule(e: React.FormEvent) {
    e.preventDefault();
    if (!giftForm.giftProductId) {
      setError(t("giftRules.needGiftProduct"));
      return;
    }
    setGiftBusy(true);
    setError("");
    setMsg("");
    const res = await fetch("/api/gift-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: giftForm.productId || null,
        minQuantity: Number(giftForm.minQuantity) || 1,
        giftProductId: giftForm.giftProductId,
        isActive: giftForm.isActive,
      }),
    });
    const data = await res.json();
    setGiftBusy(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    setMsg(t("giftRules.created"));
    setGiftForm({
      productId: "",
      minQuantity: "1",
      giftProductId: "",
      isActive: true,
    });
    await reloadGifts();
  }

  async function toggleGiftRule(id: string, isActive: boolean) {
    setGiftBusy(true);
    const res = await fetch("/api/gift-rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive }),
    });
    setGiftBusy(false);
    if (res.ok) await reloadGifts();
  }

  async function removeGiftRule(id: string) {
    if (!window.confirm(t("giftRules.confirmDelete"))) return;
    setGiftBusy(true);
    const res = await fetch(`/api/gift-rules?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setGiftBusy(false);
    if (res.ok) await reloadGifts();
  }

  const statusLabel = (status: string) => {
    if (status === "PENDING") return t("returnsPage.statusPending");
    if (status === "APPROVED") return t("returnsPage.statusApproved");
    if (status === "REJECTED") return t("returnsPage.statusRejected");
    return status;
  };

  return (
    <ModuleWorkspace
      title={t("discountsPage.title")}
      subtitle={t("discountsPage.subtitle")}
      kpis={[
        {
          label: t("discountsPage.pending"),
          value: loading ? "…" : String(pending.length),
        },
        {
          label: t("discountsPage.history"),
          value: String(history.length),
        },
      ]}
    >
      <div className="mb-5 flex flex-wrap gap-1.5 border-b border-border pb-3">
        {(
          [
            ["pending", "discountsPage.pending"],
            ["history", "discountsPage.history"],
            ["gifts", "discountsPage.gifts"],
          ] as const
        ).map(([id, labelKey]) => (
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
            {t(labelKey)}
          </button>
        ))}
      </div>

      {msg ? <p className="mb-4 text-sm text-success">{msg}</p> : null}
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      {tab === "pending" ? (
        <ModuleSection title={t("discountsPage.pending")}>
          {loading ? (
            <Card className="p-5 text-sm text-muted">
              {t("returnsPage.loading")}
            </Card>
          ) : pending.length === 0 ? (
            <Card className="border-success/20 bg-success/5 p-5 text-sm text-success">
              {t("discountsPage.emptyPending")}
            </Card>
          ) : (
            <div className="space-y-3">
              {pending.map((d) => (
                <Card key={d.id} className="border-l-4 border-l-warning p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-ink">
                        {t("dashboard.decisionDiscount")}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {formatDateTime(d.createdAt)} · {d.storeName} ·{" "}
                        {d.requesterName}
                      </div>
                      {d.products ? (
                        <div className="mt-2 text-sm text-ink">{d.products}</div>
                      ) : null}
                      <div className="mt-1 text-sm font-semibold text-ink">
                        {formatMoney(d.originalAmount)} →{" "}
                        <span className="text-success">
                          {formatMoney(d.finalAmount)}
                        </span>
                        <span className="ml-2 text-xs font-normal text-muted">
                          (−{formatMoney(d.discountAmount)}
                          {d.percent != null ? ` · ${d.percent}%` : ""})
                        </span>
                      </div>
                      {d.reason ? (
                        <p className="mt-1 text-xs text-muted">{d.reason}</p>
                      ) : null}
                    </div>
                    {canDecide ? (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          fullWidth={false}
                          disabled={busyId === d.id}
                          onClick={() => decide(d.id, "APPROVE")}
                        >
                          {t("common.approve")}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          fullWidth={false}
                          disabled={busyId === d.id}
                          onClick={() => decide(d.id, "REJECT")}
                        >
                          {t("common.reject")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </ModuleSection>
      ) : null}

      {tab === "history" ? (
        <ModuleSection title={t("discountsPage.history")}>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-page/80 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">
                      {t("storeDetail.date")}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t("common.store")}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t("common.seller")}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t("storeDetail.amount")}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t("wh.colStatus")}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t("wh.colName")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((d) => (
                    <tr
                      key={d.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3 text-muted">
                        {formatDateTime(d.reviewedAt ?? d.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-ink">{d.storeName}</td>
                      <td className="px-4 py-3 text-muted">
                        {d.requesterName}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatMoney(d.originalAmount)} →{" "}
                        {formatMoney(d.finalAmount)}
                        <span className="ml-1 text-xs text-muted">
                          (−{formatMoney(d.discountAmount)})
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-semibold",
                            d.status === "APPROVED" &&
                              "bg-success/10 text-success",
                            d.status === "REJECTED" &&
                              "bg-danger/10 text-danger"
                          )}
                        >
                          {statusLabel(d.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink">
                          {d.products || "—"}
                        </div>
                        {d.reason ? (
                          <div className="text-xs text-muted">{d.reason}</div>
                        ) : null}
                        {d.reviewerName ? (
                          <div className="text-xs text-muted">
                            {d.reviewerName}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && history.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted">
                {t("discountsPage.emptyHistory")}
              </div>
            ) : null}
          </Card>
        </ModuleSection>
      ) : null}

      {tab === "gifts" ? (
        <ModuleSection title={t("discountsPage.gifts")}>
          {!canDecide ? (
            <Card className="p-5 text-sm text-muted">
              {t("giftRules.ownerOnly")}
            </Card>
          ) : (
            <>
              <Card className="mb-4 p-5">
                <p className="mb-3 text-sm text-muted">{t("giftRules.hint")}</p>
                <p className="mb-4 text-xs text-muted">{t("giftRules.posNote")}</p>
                <form
                  onSubmit={createGiftRule}
                  className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                >
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted">
                      {t("giftRules.triggerProduct")}
                    </label>
                    <select
                      className="w-full rounded-xl border border-border bg-page px-3 py-2 text-sm"
                      value={giftForm.productId}
                      onChange={(e) =>
                        setGiftForm((f) => ({ ...f, productId: e.target.value }))
                      }
                    >
                      <option value="">{t("giftRules.anyProduct")}</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted">
                      {t("giftRules.minQty")}
                    </label>
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      className="w-full rounded-xl border border-border bg-page px-3 py-2 text-sm"
                      value={giftForm.minQuantity}
                      onChange={(e) =>
                        setGiftForm((f) => ({ ...f, minQuantity: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted">
                      {t("giftRules.giftProduct")}
                    </label>
                    <select
                      className="w-full rounded-xl border border-border bg-page px-3 py-2 text-sm"
                      value={giftForm.giftProductId}
                      onChange={(e) =>
                        setGiftForm((f) => ({
                          ...f,
                          giftProductId: e.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">{t("giftRules.selectGift")}</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end gap-2">
                    <label className="flex flex-1 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={giftForm.isActive}
                        onChange={(e) =>
                          setGiftForm((f) => ({
                            ...f,
                            isActive: e.target.checked,
                          }))
                        }
                      />
                      {t("giftRules.active")}
                    </label>
                    <Button type="submit" fullWidth={false} disabled={giftBusy}>
                      {t("giftRules.add")}
                    </Button>
                  </div>
                </form>
              </Card>
              <Card className="overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-border bg-page/80 text-xs uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-4 py-3 font-semibold">
                          {t("wh.colName")}
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          {t("giftRules.triggerProduct")}
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          {t("giftRules.minQty")}
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          {t("giftRules.giftProduct")}
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          {t("wh.colStatus")}
                        </th>
                        <th className="px-4 py-3 font-semibold" />
                      </tr>
                    </thead>
                    <tbody>
                      {giftRules.map((r) => (
                        <tr
                          key={r.id}
                          className="border-b border-border last:border-0"
                        >
                          <td className="px-4 py-3 font-semibold text-ink">
                            {r.name}
                          </td>
                          <td className="px-4 py-3 text-muted">
                            {r.productName ?? t("giftRules.anyProduct")}
                          </td>
                          <td className="px-4 py-3 tabular-nums">
                            {r.minQuantity ?? "—"}
                          </td>
                          <td className="px-4 py-3">{r.giftProductName}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              className={cn(
                                "rounded-full px-2 py-0.5 text-xs font-semibold",
                                r.isActive
                                  ? "bg-success/10 text-success"
                                  : "bg-muted/20 text-muted"
                              )}
                              onClick={() => toggleGiftRule(r.id, !r.isActive)}
                              disabled={giftBusy}
                            >
                              {r.isActive
                                ? t("status.active")
                                : t("status.archived")}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              type="button"
                              variant="secondary"
                              fullWidth={false}
                              disabled={giftBusy}
                              onClick={() => removeGiftRule(r.id)}
                            >
                              {t("giftRules.deleteBtn")}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {giftRules.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-muted">
                    {t("giftRules.empty")}
                  </div>
                ) : null}
              </Card>
            </>
          )}
        </ModuleSection>
      ) : null}
    </ModuleWorkspace>
  );
}
