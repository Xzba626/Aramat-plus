"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

type TransferRow = {
  id: string;
  createdAt: string;
  toStore: { name: string };
  fromWarehouse: { name: string };
  createdBy: { name: string };
  items: { quantity: string; product: { name: string } }[];
};

export default function WarehouseTransfersPage() {
  const { t, formatDateTime } = useI18n();
  const [items, setItems] = useState<TransferRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/transfers")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setItems(data);
        else setError(apiErrorMessage(data.error, t, "common.error"));
      });
  }, [t]);

  return (
    <div>
      <PageHeader
        title={t("wh.transfersTitle")}
        subtitle={`${t("wh.centralWarehouse")} → ${t("common.store")}`}
        actions={
          <Link href="/warehouse/transfers/new">
            <Button fullWidth={false}>{t("wh.transferNew")}</Button>
          </Link>
        }
      />

      <SectionTitle>{t("wh.historyTitle")}</SectionTitle>
      {error ? (
        <p className="mb-3 text-sm text-danger">{error}</p>
      ) : null}
      {items.map((row) => (
        <Card key={row.id} className="mb-3">
          <div className="font-semibold text-ink">
            {row.fromWarehouse.name} → {row.toStore.name}
          </div>
          <div className="mt-1 text-xs text-muted">
            {formatDateTime(row.createdAt)} · {row.createdBy.name}
          </div>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {row.items.map((it, idx) => (
              <li key={idx}>
                {it.product.name}: {Number(it.quantity)}
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {items.length === 0 && !error ? (
        <div className="py-8 text-center text-muted">{t("wh.transfersEmpty")}</div>
      ) : null}
    </div>
  );
}
