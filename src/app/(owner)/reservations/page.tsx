"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";
import { useToast } from "@/components/ui/toast";

type ReservationRow = {
  id: string;
  status: string;
  expiresAt: string;
  customerNote: string | null;
  store?: { name: string };
  createdBy?: { name: string };
  items: Array<{
    productId: string;
    quantity: number;
    product?: { name: string; salePrice?: number };
  }>;
};

export default function ReservationsPage() {
  const { t, formatMoney, formatDateTime } = useI18n();
  const { toast } = useToast();
  const [rows, setRows] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/reservations?status=ACTIVE");
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      setRows([]);
    } else {
      setError("");
      setRows(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  }, [t]);

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
    <ModuleWorkspace
      title={t("reservations.title")}
      subtitle={t("reservations.subtitle")}
    >
      {error ? (
        <Card className="mb-3 border-danger/20 bg-danger/5 p-3 text-sm text-danger">
          {error}
        </Card>
      ) : null}
      <ModuleSection title={t("reservations.title")}>
        {loading ? (
          <Card className="p-6 text-sm text-muted">{t("common.loading")}</Card>
        ) : rows.length === 0 ? (
          <Card className="p-6 text-sm text-muted">{t("reservations.empty")}</Card>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const amount = r.items.reduce(
                (s, it) => s + it.quantity * (it.product?.salePrice ?? 0),
                0
              );
              return (
                <Card key={r.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-ink">
                        {r.store?.name ?? "—"} · №{r.id.slice(-6).toUpperCase()}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {r.createdBy?.name ?? "—"} · {t("reservations.until")}{" "}
                        {formatDateTime(r.expiresAt)}
                      </div>
                      {r.customerNote ? (
                        <div className="mt-1 text-sm text-muted">{r.customerNote}</div>
                      ) : null}
                      <ul className="mt-2 space-y-0.5 text-sm text-ink">
                        {r.items.map((it) => (
                          <li key={it.productId}>
                            {it.product?.name ?? it.productId} × {it.quantity}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 text-sm font-semibold">
                        {formatMoney(amount)}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
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
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </ModuleSection>
      <p className="mt-4 text-xs text-muted">
        <Link href="/returns" className="text-brand hover:underline">
          {t("nav.salesReturns")}
        </Link>
      </p>
    </ModuleWorkspace>
  );
}
