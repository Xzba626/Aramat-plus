"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { EmptyState, LoadingBlock } from "@/components/ui/empty-state";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

type Sale = {
  id: string;
  createdAt: string;
  total: string | number;
  status: string;
  items: Array<{ quantity: string | number; product: { name: string } }>;
};

export default function PosHistoryPage() {
  const { toast } = useToast();
  const { t, formatMoney, formatDateTime } = useI18n();
  const [sales, setSales] = useState<Sale[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [returnFor, setReturnFor] = useState<Sale | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    fetch("/api/sales?limit=50")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setSales(d);
        else setError(apiErrorMessage(d.error, t, "common.error"));
        setLoading(false);
      })
      .catch(() => {
        setError(t("common.error"));
        setLoading(false);
      });
  }, [t]);

  function submitReturn(e: FormEvent) {
    e.preventDefault();
    if (!returnFor) return;
    toast(
      t("pos.returnSent", {
        id: returnFor.id.slice(-8).toUpperCase(),
      })
    );
    setReturnFor(null);
    setReason("");
  }

  return (
    <div className="space-y-3 pb-8">
      <h1 className="text-xl font-bold text-ink">
        {t("pos.history")}
        {!loading ? (
          <span className="ml-2 text-base font-semibold text-muted">
            ({sales.length})
          </span>
        ) : null}
      </h1>
      <p className="text-xs text-muted">{t("pos.historyHint")}</p>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {loading ? <LoadingBlock rows={4} label={t("pos.loading")} /> : null}

      {!loading && sales.length === 0 && !error ? (
        <EmptyState
          title={t("pos.historyEmpty")}
          description={t("pos.historyEmptyDesc")}
          actionHref="/pos"
          actionLabel={t("pos.sell")}
        />
      ) : null}

      {sales.map((s) => {
        const qty = s.items.reduce((n, it) => n + Number(it.quantity), 0);
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
              {formatDateTime(s.createdAt)} · {t("pos.positions", { n: qty })} ·{" "}
              {s.status}
            </div>
            <div className="mt-1 text-xs text-muted">
              {s.items.map((it) => it.product.name).slice(0, 3).join(", ")}
            </div>
            <Button
              type="button"
              variant="secondary"
              className="mt-3"
              fullWidth={false}
              onClick={() => setReturnFor(s)}
            >
              {t("pos.requestReturn")}
            </Button>
          </div>
        );
      })}

      {returnFor ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <Card className="w-full max-w-md p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink">{t("pos.requestReturn")}</h2>
              <button
                type="button"
                data-dismiss-esc
                className="text-sm text-muted"
                onClick={() => setReturnFor(null)}
              >
                {t("common.close")}
              </button>
            </div>
            <p className="mb-3 text-sm text-muted">
              {t("pos.receiptNo", {
                id: returnFor.id.slice(-8).toUpperCase(),
              })}{" "}
              · {formatMoney(Number(returnFor.total))}
            </p>
            <form onSubmit={submitReturn} className="space-y-3">
              <div>
                <FieldLabel>{t("pos.reason")}</FieldLabel>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
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
