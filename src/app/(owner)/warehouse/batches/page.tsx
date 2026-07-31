"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/empty-state";
import { useI18n } from "@/components/i18n/i18n-provider";

type PurchaseRow = {
  id: string;
  productId: string;
  receivedAt: string;
  quantity: number;
  remainingQty?: number;
  costPerUnit: number;
  totalCost: number | null;
  notes: string | null;
  supplier: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  product: {
    name: string;
    unit?: { symbol: string } | null;
    brand?: string | null;
  };
};

export default function PurchaseHistoryPage() {
  const { t, formatMoney, formatDate } = useI18n();
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [showFinance, setShowFinance] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/warehouse/batches")
      .then((r) => r.json())
      .then((d) => {
        setRows(Array.isArray(d.purchases) ? d.purchases : Array.isArray(d.batches) ? d.batches : []);
        setShowFinance(Boolean(d.showFinance));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title={t("purchases.historyTitle")}
        count={loading ? null : rows.length}
        subtitle={t("purchases.historySubtitle")}
        actions={
          <Link href="/warehouse/receive">
            <Button fullWidth={false}>{t("purchases.newReceive")}</Button>
          </Link>
        }
      />
      {loading ? (
        <LoadingBlock rows={4} />
      ) : (
        <div className="space-y-2">
          {rows.map((b) => (
            <Link key={b.id} href={`/warehouse/${b.productId}`}>
              <Card className="mb-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-ink">{b.product.name}</div>
                    <div className="mt-1 text-xs text-muted">
                      {formatDate(b.receivedAt)}
                      {b.supplier ? ` · ${b.supplier.name}` : ` · ${t("purchases.noSupplier")}`}
                      {` · ${t("purchases.qtyShort")} ${b.quantity}${b.product.unit?.symbol ?? ""}`}
                      {showFinance
                        ? ` · ${formatMoney(b.costPerUnit)} · ${t("purchases.total")} ${formatMoney(b.totalCost ?? 0)}`
                        : ""}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {t("purchases.addedBy")}: {b.createdBy?.name ?? t("common.system")}
                      {b.notes ? ` · ${b.notes}` : ""}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
          {rows.length === 0 ? (
            <Card className="p-8 text-center text-muted">{t("purchases.historyEmpty")}</Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
