"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";
import { useToast } from "@/components/ui/toast";

type ReservationRow = {
  id: string;
  status: string;
  expiresAt: string;
  customerNote: string | null;
  items: Array<{
    productId: string;
    quantity: number;
    product?: { name: string; salePrice?: number };
  }>;
};

export default function SellerReservationsPage() {
  const router = useRouter();
  const { t, formatMoney, formatDateTime } = useI18n();
  const { toast } = useToast();
  const [rows, setRows] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/reservations?status=ACTIVE");
    const data = await res.json();
    if (res.ok && Array.isArray(data)) setRows(data);
    else setRows([]);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function act(id: string, action: "CANCEL" | "COMPLETE") {
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
      return;
    }
    toast(
      action === "COMPLETE" ? t("reservations.completed") : t("reservations.cancelled")
    );
    await reload();
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-ink">{t("reservations.title")}</h1>
        <button
          type="button"
          onClick={() => router.push("/pos")}
          className="text-sm font-semibold text-brand"
        >
          {t("pos.backToSell")}
        </button>
      </div>
      <p className="text-sm text-muted">{t("reservations.subtitleSeller")}</p>

      {loading ? (
        <Card className="p-6 text-sm text-muted">{t("common.loading")}</Card>
      ) : rows.length === 0 ? (
        <Card className="p-6 text-sm text-muted">{t("reservations.empty")}</Card>
      ) : (
        rows.map((r) => (
          <Card key={r.id} className="space-y-3 p-4">
            <div className="text-xs text-muted">
              №{r.id.slice(-6).toUpperCase()} · {t("reservations.until")}{" "}
              {formatDateTime(r.expiresAt)}
            </div>
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
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                disabled={busyId === r.id}
                onClick={() => act(r.id, "COMPLETE")}
              >
                {t("reservations.complete")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busyId === r.id}
                onClick={() => act(r.id, "CANCEL")}
              >
                {t("reservations.cancel")}
              </Button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
