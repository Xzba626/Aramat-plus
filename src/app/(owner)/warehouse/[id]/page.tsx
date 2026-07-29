"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel, SectionTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";
import { Role } from "@prisma/client";

type Batch = {
  id: string;
  quantity: string;
  costPerUnit: string;
  receivedAt: string;
  locationType: string;
  notes?: string | null;
};

type Product = {
  id: string;
  name: string;
  salePrice: string;
  accountingType: string;
  brand?: { name: string } | null;
  unit?: { symbol: string } | null;
  batches: Batch[];
};

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const showCost = session?.user?.role === Role.OWNER;
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [price, setPrice] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch(`/api/products/${id}`);
    const data = await res.json();
    if (res.ok) {
      setProduct(data);
      setPrice(String(data.salePrice));
    } else setError(data.error || "Ошибка");
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function addBatch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMsg("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/products/${id}/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quantity: Number(fd.get("quantity")),
        costPerUnit: Number(fd.get("costPerUnit")),
        notes: String(fd.get("notes") || "") || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Ошибка");
      return;
    }
    setMsg("Партия добавлена (отдельно, без объединения)");
    (e.target as HTMLFormElement).reset();
    load();
    router.refresh();
  }

  async function changePrice(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    const res = await fetch(`/api/products/${id}/price`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ salePrice: Number(price) }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Ошибка");
      return;
    }
    setMsg("Цена продажи обновлена (история сохранена)");
    load();
  }

  if (!product) {
    return (
      <>
        <PageHeader title="Товар" />
        <div className="p-6 text-text-dim">{error || "Загрузка…"}</div>
      </>
    );
  }

  const warehouseBatches = product.batches.filter(
    (b) => b.locationType === "WAREHOUSE" && Number(b.quantity) > 0
  );

  return (
    <>
      <PageHeader title={product.name} />
      <div className="space-y-3">
        <Card>
          <div className="text-sm text-text-dim">
            {product.brand?.name ?? "—"} ·{" "}
            {product.accountingType === "WEIGHT" ? "на разлив" : "поштучно"}
          </div>
          <div className="mt-1 text-xl font-bold">
            {formatMoney(Number(product.salePrice))}
          </div>
        </Card>

        <SectionTitle>Партии на складе</SectionTitle>
        <Card>
          {warehouseBatches.length === 0 ? (
            <div className="py-4 text-center text-text-dim">Нет остатков</div>
          ) : (
            warehouseBatches.map((b, i) => (
              <div
                key={b.id}
                className="border-b border-line py-3 last:border-0"
              >
                <div className="font-semibold">
                  Партия #{i + 1} · {Number(b.quantity)}
                  {product.unit?.symbol ?? ""}
                </div>
                <div className="mt-0.5 text-xs text-text-dim">
                  {showCost
                    ? `с/с ${formatMoney(Number(b.costPerUnit))} · `
                    : ""}
                  {new Date(b.receivedAt).toLocaleString("ru-RU")}
                  {b.notes ? ` · ${b.notes}` : ""}
                </div>
              </div>
            ))
          )}
        </Card>

        <SectionTitle>Новая партия</SectionTitle>
        <form onSubmit={addBatch} className="space-y-3">
          <div className="flex gap-2.5">
            <div className="flex-1">
              <FieldLabel>Количество</FieldLabel>
              <input name="quantity" type="number" step="0.001" required />
            </div>
            <div className="flex-1">
              <FieldLabel>Себестоимость</FieldLabel>
              <input name="costPerUnit" type="number" step="0.01" required />
            </div>
          </div>
          <div>
            <FieldLabel>Комментарий</FieldLabel>
            <input name="notes" placeholder="опционально" />
          </div>
          <Button type="submit">Добавить партию</Button>
        </form>

        <SectionTitle>Цена продажи</SectionTitle>
        <form onSubmit={changePrice} className="space-y-3">
          <input
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
          <Button type="submit" variant="secondary">
            Обновить цену
          </Button>
        </form>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {msg ? <p className="text-sm text-s