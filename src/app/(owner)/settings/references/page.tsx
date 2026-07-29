"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel, SectionTitle } from "@/components/ui/card";

type RefItem = { id: string; name: string; symbol?: string; code?: string };

async function fetchList(path: string) {
  const res = await fetch(path);
  const data = await res.json();
  return Array.isArray(data) ? (data as RefItem[]) : [];
}

function RefSection({
  title,
  path,
  extraFields,
}: {
  title: string;
  path: string;
  extraFields?: "symbol" | "code";
}) {
  const [items, setItems] = useState<RefItem[]>([]);
  const [error, setError] = useState("");

  async function load() {
    setItems(await fetchList(path));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    const body: Record<string, string> = { name: String(fd.get("name")) };
    if (extraFields === "symbol") body.symbol = String(fd.get("symbol"));
    if (extraFields === "code") body.code = String(fd.get("code"));

    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Ошибка");
      return;
    }
    (e.target as HTMLFormElement).reset();
    load();
  }

  return (
    <div className="mb-6">
      <SectionTitle>{title}</SectionTitle>
      <Card>
        {items.length === 0 ? (
          <div className="py-3 text-center text-text-dim">Пусто</div>
        ) : (
          items.map((i) => (
            <div key={i.id} className="border-b border-line py-2 last:border-0">
              {i.name}
              {i.symbol ? ` (${i.symbol})` : ""}
              {i.code ? ` [${i.code}]` : ""}
            </div>
          ))
        )}
      </Card>
      <form onSubmit={onSubmit} className="mt-2 space-y-2">
        <div>
          <FieldLabel>Название</FieldLabel>
          <input name="name" required />
        </div>
        {extraFields === "symbol" ? (
          <div>
            <FieldLabel>Символ</FieldLabel>
            <input name="symbol" required placeholder="мл" />
          </div>
        ) : null}
        {extraFields === "code" ? (
          <div>
            <FieldLabel>Код</FieldLabel>
            <input name="code" required placeholder="TRANSFER" />
          </div>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" variant="secondary">
          Добавить
        </Button>
      </form>
    </div>
  );
}

export default function ReferencesPage() {
  return (
    <>
      <PageHeader title="Справочники" subtitle="Категории, бренды, единицы и типы" />
      <div className="max-w-3xl">
        <RefSection title="Категории" path="/api/categories" />
        <RefSection title="Бренды" path="/api/brands" />
        <RefSection title="Единицы измерения" path="/api/units" extraFields="symbol" />
        <RefSection title="Типы товаров" path="/api/product-types" />
        <RefSection title="Типы операций" path="/api/operation-types" extraFields="code" />
        <RefSection title="Типы расходов" path="/api/expense-types" />
      </div>
    </>
  );
}
