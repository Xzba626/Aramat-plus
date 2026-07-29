"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel, SectionTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Product = { id: string; name: string };

export default function ReceiveBatchPage() {
  const router = useRouter();
  const search = useSearchParams();
  const initialTab = search.get("tab") === "product" ? "product" : "batch";
  const [tab, setTab] = useState<"product" | "batch">(initialTab);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/products?status=active")
      .then((r) => r.json())
      .then((d) => setProducts(Array.isArray(d) ? d : []));
  }, []);

  async function onSubmitBatch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const productId = String(fd.get("productId"));
    const res = await fetch(`/api/products/${productId}/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quantity: Number(fd.get("quantity")),
        costPerUnit: Number(fd.get("costPerUnit")),
        notes: String(fd.get("notes") || "") || null,
        receivedAt: fd.get("receivedAt")
          ? new Date(String(fd.get("receivedAt"))).toISOString()
          : undefined,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Ошибка");
      return;
    }
    const salePrice = Number(fd.get("salePrice"));
    if (salePrice > 0) {
      await fetch(`/api/products/${productId}/price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salePrice }),
      });
    }
    router.push(`/warehouse/${productId}`);
    router.refresh();
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Приход товара"
        subtitle="Два сценария: новый товар или новая партия существующего"
      />

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("product")}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-semibold",
            tab === "product" ? "bg-brand text-white" : "bg-card ring-1 ring-border text-muted"
          )}
        >
          1. Новый товар
        </button>
        <button
          type="button"
          onClick={() => setTab("batch")}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-semibold",
            tab === "batch" ? "bg-brand text-white" : "bg-card ring-1 ring-border text-muted"
          )}
        >
          2. Новая партия
        </button>
      </div>

      {tab === "product" ? (
        <Card className="p-6">
          <SectionTitle>Создание нового товара</SectionTitle>
          <p className="mb-4 text-sm text-muted">
            Товар создаётся в каталоге склада. Остаток появится после первой партии (прихода).
          </p>
          <Link href="/warehouse/new">
            <Button fullWidth={false}>Перейти к форме создания товара</Button>
          </Link>
        </Card>
      ) : (
        <Card className="p-4">
          <form onSubmit={onSubmitBatch} className="space-y-3">
            <SectionTitle>Новая партия (никогда не объединяется со старой)</SectionTitle>
            <div>
              <FieldLabel>Существующий товар</FieldLabel>
              <select name="productId" required className="w-full" defaultValue="">
                <option value="" disabled>
                  Выберите товар
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Количество</FieldLabel>
              <input name="quantity" type="number" step="any" min="0.001" required className="w-full" />
            </div>
            <div>
              <FieldLabel>Закупочная цена за ед.</FieldLabel>
              <input name="costPerUnit" type="number" step="any" min="0.01" required className="w-full" />
            </div>
            <div>
              <FieldLabel>Цена продажи (опционально обновить)</FieldLabel>
              <input name="salePrice" type="number" step="any" min="0" className="w-full" />
            </div>
            <div>
              <FieldLabel>Дата поступления</FieldLabel>
              <input
                name="receivedAt"
                type="date"
                className="w-full"
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </div>
            <div>
              <FieldLabel>Поставщик / комментарий</FieldLabel>
              <input name="notes" className="w-full" placeholder="Поставщик, накладная…" />
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" disabled={loading}>
              {loading ? "Сохранение…" : "Подтвердить поступление"}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
