"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { usePosCart } from "@/lib/stores/pos-cart";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

export default function PosCartPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t, formatMoney } = useI18n();
  const lines = usePosCart((s) => s.lines);
  const setQty = usePosCart((s) => s.setQty);
  const clear = usePosCart((s) => s.clear);
  const subtotal = usePosCart((s) =>
    s.lines.reduce((n, l) => n + l.salePrice * l.quantity, 0)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [payment, setPayment] = useState<"CASH" | "CARD" | "TRANSFER">("CASH");
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountNote, setDiscountNote] = useState("");
  const [discountPercent, setDiscountPercent] = useState("10");

  async function sell() {
    if (lines.length === 0) return;
    setLoading(true);
    setError("");
    setDone("");
    const res = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentMethod: payment,
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
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
        amount: formatMoney(Number(data.total)),
      })
    );
    toast(t("pos.saleDone"));
    setTimeout(() => router.push("/pos"), 1500);
  }

  function submitDiscount(e: FormEvent) {
    e.preventDefault();
    // UI request — Backend create endpoint later
    toast(t("pos.discountSent", { pct: discountPercent }));
    setShowDiscount(false);
    setDiscountNote("");
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
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
        >
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-ink">{l.name}</div>
            <div className="text-xs text-muted">
              {formatMoney(l.salePrice)} · {t("pos.maxQty", { n: l.max })}
              {l.unitSymbol}
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

          <div className="flex items-center justify-between text-lg font-bold">
            <span>{t("pos.total")}</span>
            <span>{formatMoney(subtotal)}</span>
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowDiscount(true)}
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
            <Button type="button" onClick={sell} disabled={loading}>
              {loading ? "…" : t("pos.sell")}
            </Button>
          </div>
        </>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {done ? <p className="text-sm font-semibold text-success">{done}</p> : null}

      {showDiscount ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <Card className="w-full max-w-md p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink">{t("pos.discountModalTitle")}</h2>
              <button
                type="button"
                data-dismiss-esc
                className="text-sm text-muted"
                onClick={() => setShowDiscount(false)}
              >
                {t("common.close")}
              </button>
            </div>
            <form onSubmit={submitDiscount} className="space-y-3">
              <div>
                <FieldLabel>{t("pos.discountPercent")}</FieldLabel>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  required
                />
              </div>
              <div>
                <FieldLabel>{t("pos.reason")}</FieldLabel>
                <textarea
                  rows={3}
                  value={discountNote}
                  onChange={(e) => setDiscountNote(e.target.value)}
                  required
                />
              </div>
              <p className="text-xs text-muted">{t("pos.discountHint")}</p>
              <Button type="submit">{t("pos.sendRequest")}</Button>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
