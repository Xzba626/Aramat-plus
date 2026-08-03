"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  usePosCart,
  discountMatchesCart,
} from "@/lib/stores/pos-cart";
import {
  cartFingerprint,
  linesToFingerprintLines,
} from "@/lib/pos/cart-fingerprint";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

type BottleOption = {
  packagingSkuId: string | null;
  packagingProductId: string;
  name: string;
  volumeMl: number | null;
};

export default function PosCartPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t, formatMoney } = useI18n();
  const lines = usePosCart((s) => s.lines);
  const setQty = usePosCart((s) => s.setQty);
  const setPackaging = usePosCart((s) => s.setPackaging);
  const purgePackagingLines = usePosCart((s) => s.purgePackagingLines);
  const clear = usePosCart((s) => s.clear);
  const payment = usePosCart((s) => s.paymentMethod);
  const setPayment = usePosCart((s) => s.setPaymentMethod);
    const discount = usePosCart((s) => s.discount);
  const setDiscount = usePosCart((s) => s.setDiscount);
  const syncDiscountWithCart = usePosCart((s) => s.syncDiscountWithCart);
  const serverReservationId = usePosCart((s) => s.serverReservationId);
  const hydrated = usePosCart((s) => s._hasHydrated);
  const subtotal = usePosCart((s) =>
    s.lines.reduce((n, l) => n + l.salePrice * l.quantity, 0)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountNote, setDiscountNote] = useState("");
  const [discountAmountInput, setDiscountAmountInput] = useState("10");
  const [bottles, setBottles] = useState<BottleOption[]>([]);
  const [bottlesLoading, setBottlesLoading] = useState(false);

  const weightLines = useMemo(
    () => lines.filter((l) => l.accountingType === "WEIGHT"),
    [lines]
  );

  const loadBottles = useCallback(async () => {
    setBottlesLoading(true);
    const res = await fetch("/api/pos/packaging-bottles");
    const data = await res.json();
    setBottlesLoading(false);
    if (res.ok && Array.isArray(data)) {
      setBottles(data);
      purgePackagingLines(
        data.map((b: BottleOption) => b.packagingProductId).filter(Boolean)
      );
    }
  }, [purgePackagingLines]);

  useEffect(() => {
    if (!hydrated) return;
    loadBottles();
  }, [hydrated, loadBottles]);

  const missingBottle = weightLines.some((l) => !l.packagingProductId);

  const refreshDiscount = useCallback(
    async (id?: string) => {
      const q = id ? `?id=${id}` : "";
      const res = await fetch(`/api/discount-requests${q}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data) {
        setDiscount(null);
        return;
      }
      const hash = Array.isArray(data.cartSnapshot)
        ? cartFingerprint(linesToFingerprintLines(data.cartSnapshot))
        : usePosCart.getState().cartHash();
      const currentHash = usePosCart.getState().cartHash();
      if (hash !== currentHash) {
        setDiscount(null);
        return;
      }
      setDiscount({
        id: data.id,
        status: data.status,
        originalAmount: Number(data.originalAmount),
        discountAmount: Number(data.discountAmount),
        finalAmount: Number(data.finalAmount),
        cartHash: hash,
      });
    },
    [setDiscount]
  );

  useEffect(() => {
    if (!hydrated) return;
    syncDiscountWithCart();
    refreshDiscount(discount?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once then poll by id
  }, [hydrated]);

  useEffect(() => {
    if (!discount || discount.status !== "PENDING") return;
    const tmr = setInterval(() => refreshDiscount(discount.id), 4000);
    return () => clearInterval(tmr);
  }, [discount, refreshDiscount]);

  useEffect(() => {
    syncDiscountWithCart();
  }, [lines, syncDiscountWithCart]);

  const activeDiscount =
    discount && discountMatchesCart(discount, lines) ? discount : null;

  const payable =
    activeDiscount?.status === "APPROVED"
      ? activeDiscount.finalAmount
      : subtotal;

  async function sell() {
    if (lines.length === 0) return;
    if (activeDiscount?.status === "PENDING") {
      setError(t("pos.discountPendingBlock"));
      return;
    }
    if (missingBottle) {
      setError(t("pos.bottleRequired"));
      return;
    }
    setLoading(true);
    setError("");
    setDone("");
    const res = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentMethod: payment,
        reservationId: serverReservationId || undefined,
        discountRequestId:
          activeDiscount?.status === "APPROVED"
            ? activeDiscount.id
            : undefined,
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          ...(l.accountingType === "WEIGHT" && l.packagingProductId
            ? {
                packagingProductId: l.packagingProductId,
                ...(l.packagingSkuId
                  ? { packagingSkuId: l.packagingSkuId }
                  : {}),
              }
            : {}),
        })),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "pos.saleError"));
      return;
    }
    clear();
    setDone(
      t("pos.saleNumber", {
        id: String(data.id).slice(-8).toUpperCase(),
        amount: formatMoney(Number(data.finalAmount ?? data.total)),
      })
    );
    toast(t("pos.saleDone"));
    setTimeout(() => router.push("/pos"), 1500);
  }

  async function reserve() {
    if (lines.length === 0) return;
    setLoading(true);
    setError("");
    setDone("");
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerNote: usePosCart.getState().customerNote || undefined,
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
        })),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "pos.reserveError"));
      return;
    }
    clear();
    setDone(t("pos.reserveDone"));
    toast(t("pos.reserveDone"));
    setTimeout(() => router.push("/pos/reservations"), 1200);
  }

  async function submitDiscount(e: FormEvent) {
    e.preventDefault();
    const amount = Number(discountAmountInput) || 0;
    if (!(amount > 0) || amount > subtotal) {
      toast(t("pos.discountInvalid"));
      return;
    }
    if (!discountNote.trim()) {
      toast(t("pos.discountReasonRequired"));
      return;
    }
    const percent = Math.round((amount / subtotal) * 1000) / 10;
    const hash = cartFingerprint(linesToFingerprintLines(lines));
    const res = await fetch("/api/discount-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalAmount: subtotal,
        amount,
        percent,
        reason: discountNote.trim(),
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          salePrice: l.salePrice,
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    setDiscount({
      id: data.id,
      status: data.status,
      originalAmount: Number(data.originalAmount),
      discountAmount: Number(data.discountAmount),
      finalAmount: Number(data.finalAmount),
      cartHash: hash,
    });
    toast(t("pos.discountSent", { pct: String(percent) }));
    setShowDiscount(false);
    setDiscountNote("");
  }

  if (!hydrated) {
    return (
      <Card className="p-8 text-center text-sm text-muted">
        {t("common.loading")}
      </Card>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-ink">{t("pos.cart")}</h1>
        <button
          type="button"
          onClick={() => router.push("/pos")}
          className="text-sm font-semibold text-brand"
        >
          {t("pos.backToSell")}
        </button>
      </div>

      {lines.length === 0 && !done ? (
        <Card className="p-8 text-center text-sm text-muted">
          {t("pos.cartEmpty")}
        </Card>
      ) : null}

      {lines.map((l) => (
        <div
          key={l.productId}
          className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3"
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-ink">{l.name}</div>
              <div className="text-xs text-muted">
                {formatMoney(l.salePrice)}
                {l.unitSymbol ? ` / ${l.unitSymbol}` : ""}
                {l.accountingType === "WEIGHT" && l.packagingName
                  ? ` · ${l.packagingName}`
                  : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="h-9 w-9 rounded-xl border border-border"
                onClick={() => setQty(l.productId, l.quantity - 1)}
              >
                −
              </button>
              <span className="w-8 text-center font-semibold">{l.quantity}</span>
              <button
                type="button"
                className="h-9 w-9 rounded-xl border border-border"
                onClick={() => setQty(l.productId, l.quantity + 1)}
              >
                +
              </button>
            </div>
          </div>
          {l.accountingType === "WEIGHT" ? (
            <div className="border-t border-border pt-2">
              <FieldLabel>{t("pos.selectBottle")}</FieldLabel>
              <p className="mt-0.5 text-[11px] text-muted">{t("pos.bottleHint")}</p>
              {bottlesLoading ? (
                <p className="mt-1 text-xs text-muted">{t("common.loading")}</p>
              ) : bottles.length === 0 ? (
                <p className="mt-1 text-xs text-danger">{t("pos.noBottlesInStore")}</p>
              ) : (
                <select
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                  value={l.packagingProductId ?? ""}
                  onChange={(e) => {
                    const opt = bottles.find(
                      (b) => b.packagingProductId === e.target.value
                    );
                    if (opt) {
                      setPackaging(l.productId, {
                        packagingProductId: opt.packagingProductId,
                        packagingSkuId: opt.packagingSkuId,
                        packagingName: opt.name,
                      });
                    }
                  }}
                >
                  <option value="">{t("pos.bottlePlaceholder")}</option>
                  {bottles.map((b) => (
                    <option
                      key={b.packagingProductId}
                      value={b.packagingProductId}
                    >
                      {b.name}
                      {b.volumeMl != null
                        ? ` · ${b.volumeMl} ${t("units.ml")}`
                        : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : null}
        </div>
      ))}

      {lines.length > 0 ? (
        <>
          <div className="flex gap-2">
            {(["CASH", "CARD", "TRANSFER"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPayment(m)}
                className={cn(
                  "flex-1 rounded-xl py-2 text-xs font-semibold",
                  payment === m
                    ? "bg-brand text-white"
                    : "bg-card text-muted ring-1 ring-border"
                )}
              >
                {m === "CASH"
                  ? t("pos.cash")
                  : m === "CARD"
                    ? t("pos.card")
                    : t("pos.transfer")}
              </button>
            ))}
          </div>

          <Card className="space-y-2 p-4">
            {activeDiscount?.status === "APPROVED" ? (
              <>
                <div className="flex justify-between text-sm text-muted line-through">
                  <span>{t("pos.originalTotal")}</span>
                  <span>{formatMoney(activeDiscount.originalAmount)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted">
                  <span>{t("pos.ownerDiscount")}</span>
                  <span>−{formatMoney(activeDiscount.discountAmount)}</span>
                </div>
                <div className="flex items-center justify-between text-lg font-bold text-success">
                  <span>{t("pos.total")}</span>
                  <span>{formatMoney(activeDiscount.finalAmount)}</span>
                </div>
                <p className="text-xs text-success">
                  {t("pos.discountApprovedHint")}
                </p>
              </>
            ) : activeDiscount?.status === "PENDING" ? (
              <>
                <div className="flex justify-between text-lg font-bold">
                  <span>{t("pos.total")}</span>
                  <span>{formatMoney(subtotal)}</span>
                </div>
                <p className="text-xs text-muted">
                  {t("pos.discountPendingHint")}
                </p>
              </>
            ) : activeDiscount?.status === "REJECTED" ? (
              <>
                <div className="flex justify-between text-lg font-bold">
                  <span>{t("pos.total")}</span>
                  <span>{formatMoney(subtotal)}</span>
                </div>
                <p className="text-xs text-danger">
                  {t("pos.discountRejectedHint")}
                </p>
              </>
            ) : (
              <div className="flex items-center justify-between text-lg font-bold">
                <span>{t("pos.total")}</span>
                <span>{formatMoney(payable)}</span>
              </div>
            )}
          </Card>

          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setDiscountAmountInput(
                String(Math.min(10, Math.round(subtotal * 0.1 * 100) / 100))
              );
              setShowDiscount(true);
            }}
            disabled={activeDiscount?.status === "PENDING"}
          >
            {t("pos.requestDiscount")}
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                clear();
                router.push("/pos");
              }}
            >
              {t("pos.clearCart")}
            </Button>
            <Button
              type="button"
              onClick={sell}
              disabled={loading || activeDiscount?.status === "PENDING" || missingBottle}
            >
              {loading ? "…" : t("pos.sell")}
            </Button>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={reserve}
            disabled={loading}
          >
            {t("pos.reserve")}
          </Button>
          <p className="text-xs text-muted">{t("pos.reserveHint")}</p>
          <p className="text-xs text-muted">{t("pos.cartPersistedHint")}</p>
        </>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {done ? <p className="text-sm font-semibold text-success">{done}</p> : null}

      {showDiscount ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <Card className="w-full max-w-md p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink">
                {t("pos.discountModalTitle")}
              </h2>
              <button
                type="button"
                data-dismiss-esc
                className="text-sm text-muted"
                onClick={() => setShowDiscount(false)}
              >
                {t("common.close")}
              </button>
            </div>
            <form className="space-y-3" onSubmit={submitDiscount}>
              <div className="rounded-xl bg-page px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">{t("pos.originalTotal")}</span>
                  <span className="font-semibold">{formatMoney(subtotal)}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-muted">{t("pos.desiredDiscount")}</span>
                  <span>
                    {formatMoney(Number(discountAmountInput) || 0)}
                  </span>
                </div>
                <div className="mt-1 flex justify-between font-bold text-success">
                  <span>{t("pos.finalTotal")}</span>
                  <span>
                    {formatMoney(
                      Math.max(0, subtotal - (Number(discountAmountInput) || 0))
                    )}
                  </span>
                </div>
              </div>
              <div>
                <FieldLabel>{t("pos.desiredDiscount")}</FieldLabel>
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  max={subtotal}
                  value={discountAmountInput}
                  onChange={(e) => setDiscountAmountInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <FieldLabel>{t("pos.reason")}</FieldLabel>
                <textarea
                  value={discountNote}
                  onChange={(e) => setDiscountNote(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                  rows={3}
                  required
                />
              </div>
              <p className="text-xs text-muted">{t("pos.discountHint")}</p>
              <Button type="submit" className="w-full">
                {t("pos.sendRequest")}
              </Button>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
