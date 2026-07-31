"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/empty-state";
import { useI18n } from "@/components/i18n/i18n-provider";

type BatchRow = {
  id: string;
  productId: string;
  receivedAt: string;
  quantity: number;
  costPerUnit: number;
  notes: string | null;
  supplier?: { id: string; name: string } | null;
  product: {
    name: string;
    unit?: { symbol: string } | null;
  };
};

export default function BatchesPage() {
  const { t, formatMoney, formatDate } = useI18n();
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [showFinance, setShowFinance] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/warehouse/batches")
      .then((r) => r.json())
      .then((d) => {
        setBatches(Array.isArray(d.batches) ? d.batches : []);
        setShowFinance(Boolean(d.showFinance));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title={t("wh.batchesTitle")}
        count={loading ? null : batches.length}
        subtitle={t("wh.stockSubtitle")}
        actions={
          <Link href="/warehouse/receive">
            <Button fullWidth={false}>{t("warehouse.newBatch")}</Button>
          </Link>
        }
      />
      {loading ? (
        <LoadingBlock rows={4} />
      ) : (
        <div className="space-y-2">
          {batches.map((b) => (
            <Link key={b.id} href={`/warehouse/${b.productId}`}>
              <Card className="mb-2 p-4">
                <div className="font-semibold text-ink">{b.product.name}</div>
                <div className="mt-1 text-xs text-muted">
                  {formatDate(b.receivedAt)} · {t("wh.colQty")} {b.quantity}
                  {b.product.unit?.symbol ?? ""}
                  {b.supplier ? ` · ${b.supplier.name}` : ""}
                  {showFinance
                    ? ` · ${t("warehouse.productCardCost")} ${formatMoney(b.costPerUnit)}`
                    : ""}
                  {b.notes ? ` · ${b.notes}` : ""}
                </div>
              </Card>
            </Link>
          ))}
          {batches.length === 0 ? (
            <Card className="p-8 text-center text-muted">{t("wh.batchesEmpty")}</Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
