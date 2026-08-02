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
  receivedAt: string;
  productId: string;
  productName: string;
  quantity: number;
  costPerUnit: number;
  totalCost: number;
  notes: string | null;
  supplier: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
};

export default function PurchaseHistoryPage() {
  const { t, formatMoney, formatDate } = useI18n();
  const [items, setItems] = useState<PurchaseRow[]>([]);
  const [showFinance, setShowFinance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetch("/api/warehouse/purchases?limit=100")
      .then((r) => r.json())
      .then((d) => {
        setItems(Array.isArray(d.items) ? d.items : []);
        setShowFinance(Boolean(d.showFinance));
        setTotal(Number(d.total) || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title={t("wh.purchasesTitle")}
        count={loading ? null : total}
        subtitle={t("wh.purchasesSubtitle")}
        actions={
          <Link href="/warehouse/receive">
            <Button fullWidth={false}>{t("warehouse.actionReceive")}</Button>
          </Link>
        }
      />

      {loading ? (
        <LoadingBlock rows={5} />
      ) : (
        <div className="overflow-x-auto rounded-2xl ring-1 ring-border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">{t("journalPage.colDate")}</th>
                <th className="px-4 py-3 font-semibold">{t("wh.colName")}</th>
                <th className="px-4 py-3 font-semibold">{t("wh.colQty")}</th>
                {showFinance ? (
                  <>
                    <th className="px-4 py-3 font-semibold">{t("warehouse.productCost")}</th>
                    <th className="px-4 py-3 font-semibold">{t("wh.receiveTotal")}</th>
                  </>
                ) : null}
                <th className="px-4 py-3 font-semibold">{t("wh.addedBy")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-surface/50">
                  <td className="px-4 py-3 text-muted">{formatDate(row.receivedAt)}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/warehouse/${row.productId}`}
                      className="font-semibold text-brand hover:underline"
                    >
                      {row.productName}
                    </Link>
                    {row.notes ? (
                      <div className="text-xs text-muted">{row.notes}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{row.quantity}</td>
                  {showFinance ? (
                    <>
                      <td className="px-4 py-3">{formatMoney(row.costPerUnit)}</td>
                      <td className="px-4 py-3 font-semibold">{formatMoney(row.totalCost)}</td>
                    </>
                  ) : null}
                  <td className="px-4 py-3 text-muted">
                    {row.createdBy?.name ?? t("common.system")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 ? (
            <Card className="rounded-none border-0 p-8 text-center text-muted ring-0">
              {t("wh.purchasesEmpty")}
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
