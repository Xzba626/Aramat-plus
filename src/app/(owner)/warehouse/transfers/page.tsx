"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";

type TransferRow = {
  id: string;
  createdAt: string;
  toStore: { name: string };
  fromWarehouse: { name: string };
  createdBy: { name: string };
  items: { quantity: string; product: { name: string } }[];
};

export default function WarehouseTransfersPage() {
  const [items, setItems] = useState<TransferRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/transfers")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setItems(data);
        else setError(data.error || "Ошибка");
      });
  }, []);

  return (
    <div>
      <PageHeader
        title="Перемещения"
        subtitle="Склад → магазин"
        actions={
          <Link href="/warehouse/transfers/new">
            <Button fullWidth={false}>+ Отправить</Button>
          </Link>
        }
      />

      <SectionTitle>История</SectionTitle>
      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
      {items.map((t) => (
        <Card key={t.id} className="mb-3">
          <div className="font-semibold text-ink">
            {t.fromWarehouse.name} → {t.toStore.name}
          </div>
          <div className="mt-1 text-xs text-muted">
            {new Date(t.createdAt).toLocaleString("ru-RU")} · {t.createdBy.name}
          </div>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {t.items.map((it, idx) => (
              <li key={idx}>
                {it.product.name}: {Number(it.quantity)}
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {items.length === 0 && !error ? (
        <div className="py-8 text-center text-muted">Пока нет перемещений</div>
      ) : null}
    </div>
  );
}
