"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";

type Cat = {
  id: string;
  name: string;
  lowStockThreshold: string | number;
  isArchived: boolean;
};

export default function WarehouseCategoriesPage() {
  const [items, setItems] = useState<Cat[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");

  async function load() {
    const res = await fetch(
      `/api/categories?archived=${showArchived ? "1" : "0"}`
    );
    const data = await res.json();
    setItems(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Ошибка");
      return;
    }
    setName("");
    load();
  }

  async function archive(id: string, isArchived: boolean) {
    await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isArchived }),
    });
    load();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Категории"
        subtitle="Справочник внутри центрального склада · удаление запрещено"
        actions={
          <Button
            type="button"
            variant="secondary"
            fullWidth={false}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? "Активные" : "Архив"}
          </Button>
        }
      />

      {!showArchived ? (
        <Card className="max-w-md p-4">
          <form onSubmit={onCreate} className="flex gap-2">
            <div className="flex-1">
              <FieldLabel>Новая категория</FieldLabel>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full"
                placeholder="Парфюм"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" fullWidth={false}>
                Создать
              </Button>
            </div>
          </form>
          {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
        </Card>
      ) : null}

      <div className="space-y-2">
        {items.map((c) => (
          <Card key={c.id} className="flex items-center justify-between gap-3 p-4">
            <div>
              <div className="font-semibold text-ink">{c.name}</div>
              <div className="text-xs text-muted">
                порог low-stock: {Number(c.lowStockThreshold)}
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              fullWidth={false}
              size="sm"
              onClick={() => archive(c.id, !c.isArchived)}
            >
              {c.isArchived ? "Восстановить" : "В архив"}
            </Button>
          </Card>
        ))}
        {items.length === 0 ? (
          <p className="py-8 text-center text-muted">Пусто</p>
        ) : null}
      </div>
    </div>
  );
}
