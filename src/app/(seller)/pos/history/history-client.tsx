"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { EmptyState, LoadingBlock } from "@/components/ui/empty-state";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage, labelSaleStatus } from "@/lib/i18n/labels";
import { cn } from "@/lib/utils";

type SaleItem = {
  id: string;
  quantity: string | number;
  product: { name: string };
};

type Sale = {
  id: string;
  createdAt: string;
  total: string | number;
  status: string;
  items: SaleItem[];
};

type ReservationRow = {
  id: string;
  status: string;
  expiresAt: string | null;
  noExpiry?: boolean;
  isCartAutosave?: boolean;
  customerNote: string | null;
  createdAt: string;
  items: Array<{
    productId: string;
    quantity: number;
    product?: { name: string; salePrice?: number };
  }>;
};

type TabKey = "sales" | "reservations";

function formatRemaining(
  expiresAt: string | null,
  t: (k: string, p?: Record<string, string | number>) => string
): string {
  if (!expiresAt) return "—";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return t("pos.reserveExpiredAgo");
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) {
    return t("pos.reserveRemaining", {
      time: t("pos.reserveTtlMins", { n: mins }),
    });
  }
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const time =
    m > 0
      ? t("pos.reserveTtlHoursMins", { h, m })
      : t("pos.reserveTtlHours", { h });
  return t("pos.reserveRemaining", { time });
}

export default function PosHistoryClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { t, formatMoney, formatDateTime } = useI18n();
  const initialTab =
    searchParams.get("tab") === "reservations" ? "reservations" : "sales";
  const [tab, setTab] = useState<TabKey>(initialTab);

  function selectTab(next: TabKey) {
    setTab(next);
    const qs = next === "reservations" ? "?tab=reservations" : "";
    router.replace(`/pos/history${qs}`, { scroll: false });
  }

  const [sales, setSales] = useState<Sale[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [returnFor, setReturnFor] = useState<Sale | null>(null);
  const [reason, setReason] = useState("");
  const [partialQty, setPartialQty] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const loadSales = useCallback(async () => {
    const res = await fetch("/api/sales?limit=50");
    const d = await res.json();
    if (Array.isArray(d)) setSales(d);
    else setError(apiErrorMessage(d.error, t, "common.error"));
  }, [t]);

  const loadReservations = useCallback(async () => {
    const res = await fetch("/api/reservations?status=ALL&limit=50");
    const d = await res.json();
    if (Array.isArray(d)) {
      setReservations(
        d.filter((r: ReservationRow) => !r.isCartAutosave)
      );
    } else {
      setReservations([]);
    }
  }, []);

  // Refresh remaining-time labels and re-fetch so expired rows flip to EXPIRED
  useEffect(() => {
    if (tab !== "reservations") return;
    const id = setInterval(() => {
      setTick((n) => n + 1);
      void loadReservations();
    }, 30_000);
    return () => clearInterval(id);
  }, [tab, loadReservations]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        await Promise.all([loadSales(), loadReservations()]);
      } catch {
        if (!cancelled) setError(t("common.error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSales, loadReservations, t]);

  const visibleReservations = useMemo(() => reservations, [reservations]);

  function openReturn(s: Sale) {
    setReturnFor(s);
    const qty: Record<string, string> = {};
    for (const it of s.items) {
      qty[it.id] = String(it.quantity);
    }
    setPartialQty(qty);
    setReason("");
  }

  async function submitReturn(e: FormEvent) {
    e.preventDefault();
    if (!returnFor) return;

    const items = returnFor.items
      .map((it) => ({
        saleItemId: it.id,
        quantity: Number(partialQty[it.id] || 0),
      }))
      .filter((it) => it.quantity > 0);

    if (!items.length) {
      toast(t("common.error"));
      return;
    }

    if (!reason.trim() || reason.trim().length < 3) {
      toast(t("pos.returnReasonRequired"));
      return;
    }

    const res = await fetch("/api/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        saleId: returnFor.id,
        reasonCode: "OTHER",
        reason: reason.trim(),
        items,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    toast(
      t("pos.returnSent", {
        id: returnFor.id.slice(-8).toUpperCase(),
      })
    );
    setReturnFor(null);
    setReason("");
  }

  async function actReservation(id: string, action: "CANCEL" | "COMPLETE") {
    setBusyId(id);
    const res = await fetch(`/api/reservations/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) {
      toast(apiErrorMessage(data.error, t, "common.error"));
      await loadReservations();
      return;
    }
    toast(
      action === "COMPLETE"
        ? t("reservations.completed")
        : t("reservations.cancelled")
    );
    await loadReservations();
  }

  function statusLabel(status: string) {
    const key = `reservations.status${status}` as const;
    const translated = t(key);
    return translated === key ? status : translated;
  }

  return (
    <div className="space-y-3 pb-8">
      <h1 className="text-xl font-bold text-ink">{t("pos.history")}</h1>

      <div className="flex gap-1 rounded-full border border-border p-0.5">
        <button
          type="button"
          className={cn(
            "flex-1 rounded-full px-3 py-2 text-sm font-semibold",
            tab === "sales"
              ? "bg-brand text-white"
              : "text-muted hover:text-ink"
          )}
          onClick={() => selectTab("sales")}
        >
          {t("pos.historyTabSales")}
          {!loading ? (
            <span className="ml-1 opacity-80">({sales.length})</span>
          ) : null}
        </button>
        <button
          type="button"
          className={cn(
            "flex-1 rounded-full px-3 py-2 text-sm font-semibold",
            tab === "reservations"
              ? "bg-brand text-white"
              : "text-muted hover:text-ink"
          )}
          onClick={() => selectTab("reservations")}
        >
          {t("pos.historyTabReservations")}
          {!loading ? (
            <span className="ml-1 opacity-80">
              ({visibleReservations.length})
            </span>
          ) : null}
        </button>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {loading ? <LoadingBlock rows={4} label={t("pos.loading")} /> : null}

      {!loading && tab === "sales" ? (
        <>
          <p className="text-xs text-muted">{t("pos.historyHint")}</p>
          {sales.length === 0 && !error ? (
            <EmptyState
              title={t("pos.historyEmpty")}
              description={t("pos.historyEmptyDesc")}
              actionHref="/pos"
              actionLabel={t("pos.sell")}
            />
          ) : null}
          {sales.map((s) => {
            const qty = s.items.reduce((n, it) => n + Number(it.quantity), 0);
            const canReturn =
              s.status === "COMPLETED" || s.status === "PARTIAL_RETURN";
            return (
              <div
                key={s.id}
                className="rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex justify-between gap-2">
                  <div className="font-semibold text-ink">
                    № {s.id.slice(-8).toUpperCase()}
                  </div>
                  <div className="font-bold">{formatMoney(Number(s.total))}</div>
                </div>
                <div className="mt-1 text-xs text-muted">
                  {formatDateTime(s.createdAt)} ·{" "}
                  {t("pos.positions", { n: qty })} ·{" "}
                  {labelSaleStatus(s.status, t)}
                </div>
                <div className="mt-1 text-xs text-muted">
                  {s.items
                    .map((it) => it.product.name)
                    .slice(0, 3)
                    .join(", ")}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3"
                  fullWidth={false}
                  disabled={!canReturn}
                  onClick={() => openReturn(s)}
                >
                  {canReturn
                    ? t("pos.requestReturn")
                    : labelSaleStatus(s.status, t)}
                </Button>
              </div>
            );
          })}
        </>
      ) : null}

      {!loading && tab === "reservations" ? (
        <>
          <p className="text-xs text-muted">{t("reservations.subtitleSeller")}</p>
          {visibleReservations.length === 0 ? (
            <EmptyState
              title={t("reservations.empty")}
              description={t("reservations.subtitleSeller")}
              actionHref="/pos/cart"
              actionLabel={t("pos.reserve")}
            />
          ) : null}
          {visibleReservations.map((r) => {
            const active = r.status === "ACTIVE";
            return (
              <Card key={r.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-ink">
                      №{r.id.slice(-6).toUpperCase()}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {t("reservations.createdAt")}{" "}
                      {formatDateTime(r.createdAt)}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                      r.status === "ACTIVE" && "bg-zone-money/15 text-zone-money-deep",
                      r.status === "EXPIRED" && "bg-danger/10 text-danger",
                      r.status === "CANCELLED" && "bg-muted/30 text-muted",
                      r.status === "COMPLETED" && "bg-brand/10 text-brand"
                    )}
                  >
                    {statusLabel(r.status)}
                  </span>
                </div>
                {active && r.expiresAt ? (
                  <div className="text-sm font-medium text-ink">
                    {formatRemaining(r.expiresAt, t)}
                    <span className="ml-1 text-xs font-normal text-muted">
                      ({t("reservations.until")} {formatDateTime(r.expiresAt)})
                    </span>
                  </div>
                ) : r.expiresAt ? (
                  <div className="text-xs text-muted">
                    {t("reservations.until")} {formatDateTime(r.expiresAt)}
                  </div>
                ) : null}
                {r.customerNote ? (
                  <div className="text-sm text-muted">{r.customerNote}</div>
                ) : null}
                <ul className="space-y-1 text-sm">
                  {r.items.map((it) => (
                    <li key={it.productId}>
                      {it.product?.name ?? it.productId} × {it.quantity}
                      {it.product?.salePrice != null
                        ? ` · ${formatMoney(it.quantity * it.product.salePrice)}`
                        : ""}
                    </li>
                  ))}
                </ul>
                {active ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => actReservation(r.id, "COMPLETE")}
                    >
                      {t("reservations.complete")}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busyId === r.id}
                      onClick={() => actReservation(r.id, "CANCEL")}
                    >
                      {t("reservations.cancel")}
                    </Button>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </>
      ) : null}

      {returnFor ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <Card className="w-full max-w-md p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink">
                {t("pos.requestReturn")}
              </h2>
              <button
                type="button"
                data-dismiss-esc
                className="text-sm text-muted"
                onClick={() => setReturnFor(null)}
              >
                {t("common.close")}
              </button>
            </div>
            <form onSubmit={submitReturn} className="space-y-3">
              {returnFor.items.map((it) => (
                <div key={it.id}>
                  <FieldLabel>
                    {it.product.name} (max {it.quantity})
                  </FieldLabel>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    max={Number(it.quantity)}
                    value={partialQty[it.id] ?? "0"}
                    onChange={(e) =>
                      setPartialQty((q) => ({
                        ...q,
                        [it.id]: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-border px-3 py-2 text-sm"
                  />
                </div>
              ))}
              <div>
                <FieldLabel>{t("pos.returnReasonRequired")}</FieldLabel>
                <textarea
                  required
                  minLength={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-border px-3 py-2 text-sm"
                  placeholder={t("pos.returnReasonPlaceholder")}
                />
              </div>
              <p className="text-xs text-muted">{t("pos.returnHint")}</p>
              <Button type="submit">{t("pos.sendToOwner")}</Button>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
