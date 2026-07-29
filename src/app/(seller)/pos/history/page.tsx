"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { EmptyState, LoadingBlock } from "@/components/ui/empty-state";

type Sale = {
  id: string;
  createdAt: string;
  total: string | number;
  status: string;
  items: Array<{ quantity: string | number; product: { name: string } }>;
};

export default function PosHistoryPage() {
  const { toast } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [returnFor, setReturnFor] = useState<Sale | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    fetch("/api/sales?limit=50")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setSales(d);
        else setError(d.error || "Ошибка загрузки");
        setLoading(false);
      })
      .catch(() => {
        setError("Ошибка загрузки");
        setLoading(false);
      });
  }, []);

  function submitReturn(e: FormEvent) {
    e.preventDefault();
    if (!returnFor) return;
    toast(`Запрос возврата по чеку №${returnFor.id.slice(-8).toUpperCase()} отправлен`);
    setReturnFor(null);
    setReason("");
  }

  return (
    <div className="space-y-3 pb-8">
      <h1 className="text-xl font-bold text-ink">
        История
        {!loading ? (
          <span className="ml-2 text-base font-semibold text-muted">
            ({sales.length})
          </span>
        ) : null}
      </h1>
      <p className="text-xs text-muted">
        Только ваши продажи · из чека можно запросить возврат
      </p>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {loading ? <LoadingBlock rows={4} label="Загрузка продаж…" /> : null}

      {!loading && sales.length === 0 && !error ? (
        <EmptyState
          title="Продаж пока нет"
          description="Оформите первую продажу в разделе «Продажа»."
          actionHref="/pos"
          actionLabel="К продаже"
        />
      ) : null}

      {sales.map((s) => {
        const qty = s.items.reduce((n, it) => n + Number(it.quantity), 0);
        return (
          <div
            key={s.id}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <div className="flex justify-between gap-2">
              <div className="font-semibold text-ink">
                № {s.id.slice(-8).toUpperCase()}
              </div>
              <div className="font-bold">{formatMoney(Number(s.total))}</div>
            </div>
            <div className="mt-1 text-xs text-muted">
              {new Date(s.createdAt).toLocaleString("ru-RU")} · {qty} поз. ·{" "}
              {s.status}
            </div>
            <div className="mt-1 text-xs text-muted">
              {s.items.map((it) => it.product.name).slice(0, 3).join(", ")}
            </div>
            <Button
              type="button"
              variant="secondary"
              className="mt-3"
              fullWidth={false}
              onClick={() => setReturnFor(s)}
            >
              Запросить возврат
            </Button>
          </div>
        );
      })}

      {returnFor ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <Card className="w-full max-w-md p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink">Запрос возврата</h2>
              <button
                type="button"
                data-dismiss-esc
                className="text-sm text-muted"
                onClick={() => setReturnFor(null)}
              >
                Закрыть
              </button>
            </div>
            <p className="mb-3 text-sm text-muted">
              Чек №{returnFor.id.slice(-8).toUpperCase()} ·{" "}
              {formatMoney(Number(returnFor.total))}
            </p>
            <form onSubmit={submitReturn} className="space-y-3">
              <div>
                <FieldLabel>Причина</FieldLabel>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Клиент передумал, брак…"
                  required
                />
              </div>
              <p className="text-xs text-muted">
                Остатки продавец не меняет сам. Решение принимает владелец.
              </p>
              <Button type="submit">Отправить владельцу</Button>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
