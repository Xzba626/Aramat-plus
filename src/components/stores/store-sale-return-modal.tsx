"use client";

import { FormEvent, useState } from "react";
import { ReturnReasonCode } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

type SaleLine = {
  id: string;
  productName: string;
  sku: string | null;
  quantity: number;
  returnedQty: number;
  returnableQty: number;
  unit: string;
  grossProfit?: number;
  totalCost?: number;
};

type SaleRow = {
  id: string;
  number: string;
  total: number;
  items: SaleLine[];
};

type Props = {
  sale: SaleRow;
  onClose: () => void;
  onDone: () => void;
};

export function StoreSaleReturnModal({ sale, onClose, onDone }: Props) {
  const { t, formatMoney } = useI18n();
  const [qtyByItem, setQtyByItem] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const it of sale.items) {
      if (it.returnableQty > 0) init[it.id] = it.returnableQty;
    }
    return init;
  });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const items = sale.items
      .filter((it) => it.returnableQty > 0)
      .map((it) => ({
        saleItemId: it.id,
        quantity: qtyByItem[it.id] ?? 0,
      }))
      .filter((x) => x.quantity > 0);
    if (!items.length) {
      setError(t("storeDetail.returnNothingSelected"));
      return;
    }
    if (!reason.trim()) {
      setError(t("pos.returnReasonRequired"));
      return;
    }
    setBusy(true);
    try {
      const createRes = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: sale.id,
          reason,
          reasonCode: ReturnReasonCode.OTHER,
          items,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        setError(apiErrorMessage(created.error, t, "common.error"));
        return;
      }
      const decRes = await fetch(`/api/returns/${created.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "APPROVE" }),
      });
      const decided = await decRes.json();
      if (!decRes.ok) {
        setError(apiErrorMessage(decided.error, t, "common.error"));
        return;
      }
      onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto p-4">
        <h3 className="text-lg font-bold text-ink">
          {t("storeDetail.returnSaleTitle", { number: sale.number })}
        </h3>
        <form onSubmit={submit} className="mt-4 space-y-4">
          {sale.items.map((it) => (
            <div key={it.id} className="rounded-lg border border-border p-3">
              <div className="font-medium text-ink">
                {it.productName}
                {it.sku ? ` · ${it.sku}` : ""}
              </div>
              <div className="mt-1 text-xs text-muted">
                {t("storeDetail.returnSold")}: {it.quantity} {it.unit} ·{" "}
                {t("storeDetail.returnAlready")}: {it.returnedQty} ·{" "}
                {t("storeDetail.returnAvailable")}: {it.returnableQty}
              </div>
              {it.returnableQty > 0 ? (
                <input
                  type="number"
                  min={0}
                  max={it.returnableQty}
                  step="any"
                  className="mt-2 w-full"
                  value={qtyByItem[it.id] ?? 0}
                  onChange={(e) =>
                    setQtyByItem((m) => ({
                      ...m,
                      [it.id]: Math.min(
                        it.returnableQty,
                        Math.max(0, Number(e.target.value))
                      ),
                    }))
                  }
                />
              ) : (
                <p className="mt-2 text-xs text-muted">
                  {t("storeDetail.returnFullyReturned")}
                </p>
              )}
            </div>
          ))}
          <div>
            <FieldLabel>{t("pos.returnReasonRequired")}</FieldLabel>
            <textarea
              className="mt-1 w-full rounded-lg border border-border p-2 text-sm"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {t("storeDetail.confirmReturn")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
