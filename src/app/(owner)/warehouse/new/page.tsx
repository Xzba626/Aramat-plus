"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel, SectionTitle } from "@/components/ui/card";

type RefItem = { id: string; name: string; symbol?: string };

export default function NewProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<RefItem[]>([]);
  const [brands, setBrands] = useState<RefItem[]>([]);
  const [units, setUnits] = useState<RefItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/brands").then((r) => r.json()),
      fetch("/api/units").then((r) => r.json()),
    ]).then(([c, b, u]) => {
      setCategories(Array.isArray(c) ? c : []);
      setBrands(Array.isArray(b) ? b : []);
      setUnits(Array.isArray(u) ? u : []);
    });
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const initialQuantity = Number(fd.get("initialQuantity") || 0);
    const costPerUnit = Number(fd.get("costPerUnit") || 0);
    const payload = {
      name: String(fd.get("name") || ""),
      sku: String(fd.get("sku") || "") || null,
      barcode: String(fd.get("barcode") || "") || null,
      description: String(fd.get("description") || "") || null,
      brandId: String(fd.get("brandId") || "") || null,
      categoryId: String(fd.get("categoryId") || "") || null,
      unitId: String(fd.get("unitId") || "") || null,
      accountingType: String(fd.get("accountingType") || "PIECE"),
      salePrice: Number(fd.get("salePrice")),
      minStock: Number(fd.get("minStock") || 0),
      ...(initialQuantity > 0 && costPerUnit > 0
        ? { initialQuantity, costPerUnit }
        : {}),
    };

    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Ошибка");
      return;
    }
    router.push(`/warehouse/${data.id}`);
    router.refresh();
  }

  return (
    <div className="max-w-xl">
      <PageHeader
        title="Создание товара"
        subtitle="Остаток будет 0, пока не оформите поступление (новую партию)"
      />
      <Card className="p-4">
        <form onSubmit={onSubmit} className="space-y-3">
          <SectionTitle>Основная информация</SectionTitle>
          <div>
            <FieldLabel>Название</FieldLabel>
            <input name="name" required className="w-full" placeholder="Dior Sauvage" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Артикул (SKU)</FieldLabel>
              <input name="sku" className="w-full" placeholder="ARM-000125" />
            </div>
            <div>
              <FieldLabel>Штрихкод</FieldLabel>
              <input name="barcode" className="w-full" />
            </div>
          </div>
          <div>
            <FieldLabel>Описание</FieldLabel>
            <textarea name="description" rows={2} className="w-full rounded-xl border border-border px-3 py-2" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Бренд</FieldLabel>
              <select name="brandId" defaultValue="" className="w-full">
                <option value="">—</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Категория</FieldLabel>
              <select name="categoryId" defaultValue="" className="w-full">
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Тип</FieldLabel>
              <select name="accountingType" defaultValue="PIECE" className="w-full">
                <option value="PIECE">Штучный / аксессуар</option>
                <option value="WEIGHT">Парфюм на разлив (мл)</option>
              </select>
            </div>
            <div>
              <FieldLabel>Единица</FieldLabel>
              <select name="unitId" defaultValue="" className="w-full">
                <option value="">—</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.symbol})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Цена продажи</FieldLabel>
              <input name="salePrice" type="number" step="0.01" required className="w-full" />
            </div>
            <div>
              <FieldLabel>Мин. остаток</FieldLabel>
              <input name="minStock" type="number" step="any" min="0" defaultValue={0} className="w-full" />
            </div>
          </div>

          <SectionTitle>Первая партия (необязательно)</SectionTitle>
          <p className="text-xs text-muted">
            По спецификации остаток может остаться нулевым. Партию лучше оформить через
            «Поступление».
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Кол-во партии</FieldLabel>
              <input name="initialQuantity" type="number" step="any" min="0" className="w-full" />
            </div>
            <div>
              <FieldLabel>Себестоимость</FieldLabel>
              <input name="costPerUnit" type="number" step="any" min="0" className="w-full" />
            </div>
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" disabled={loading}>
            {loading ? "Сохранение…" : "Создать товар"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
