"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoney } from "@/lib/utils";
import {
  DataTable,
  DataTableBody,
  DataTableElement,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
  DataTableToolbar,
} from "@/components/ui/data-table";

type StockRow = {
  product: {
    id: string;
    name: string;
    brand?: { name: string } | null;
    category?: { name: string } | null;
    unit?: { symbol: string } | null;
  };
  warehouseQty: number;
  storeQty: number;
  totalQty: number;
  stores: { storeId: string; storeName: string; qty: number }[];
  warehouseBatches: Array<{
    id: string;
    qty: number;
    costPerUnit?: number;
    receivedAt: string;
    notes: string | null;
  }>;
};

export default function WarehouseStockPage() {
  const [items, setItems] = useState<StockRow[]>([]);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showFinance, setShowFinance] = useState(true);

  useEffect(() => {
    fetch("/api/warehouse/stock-breakdown")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        if (d.items?.[0]?.warehouseBatches?.[0]?.costPerUnit === undefined) {
          setShowFinance(false);
        }
      });
  }, []);

  const filtered = items.filter((row) => {
    if (!q.trim()) return true;
    const hay = `${row.product.name} ${row.product.brand?.name ?? ""}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  return (
    <div>
      <PageHeader
        title="Остатки"
        subtitle="Склад · партии · магазины — единая картина"
      />

      <DataTableToolbar search={q} onSearchChange={setQ} />

      <DataTable>
        <DataTableElement>
          <DataTableHead>
            <DataTableTh>Товар</DataTableTh>
            <DataTableTh>На складе</DataTableTh>
            <DataTableTh>В магазинах</DataTableTh>
            <DataTableTh>Всего</DataTableTh>
            <DataTableTh> </DataTableTh>
          </DataTableHead>
          <DataTableBody>
            {filtered.map((row) => (
              <Fragment key={row.product.id}>
                <DataTableRow>
                  <DataTableTd>
                    <Link
                      href={`/warehouse/${row.product.id}`}
                      className="font-semibold text-ink hover:text-brand"
                    >
                      {row.product.name}
                    </Link>
                    <div className="text-xs text-muted">
                      {row.product.brand?.name ?? "—"} · {row.product.category?.name ?? "—"}
                    </div>
                  </DataTableTd>
                  <DataTableTd className="font-semibold">
                    {row.warehouseQty}
                    {row.product.unit?.symbol ?? ""}
                  </DataTableTd>
                  <DataTableTd>{row.storeQty}{row.product.unit?.symbol ?? ""}</DataTableTd>
                  <DataTableTd className="font-bold">{row.totalQty}</DataTableTd>
                  <DataTableTd>
                    <button
                      type="button"
                      className="text-sm text-brand"
                      onClick={() =>
                        setExpanded((id) => (id === row.product.id ? null : row.product.id))
                      }
                    >
                      {expanded === row.product.id ? "Скрыть" : "Детали"}
                    </button>
                  </DataTableTd>
                </DataTableRow>
                {expanded === row.product.id ? (
                  <tr key={`${row.product.id}-detail`} className="bg-page/50">
                    <td colSpan={5} className="px-4 py-3">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <div className="mb-2 text-xs font-bold uppercase text-muted">
                            Партии на складе (FIFO)
                          </div>
                          {row.warehouseBatches.length === 0 ? (
                            <p className="text-sm text-muted">Нет партий</p>
                          ) : (
                            <ul className="space-y-1 text-sm">
                              {row.warehouseBatches.map((b) => (
                                <li key={b.id} className="text-muted">
                                  {new Date(b.receivedAt).toLocaleDateString("ru-RU")} ·{" "}
                                  {b.qty}
                                  {row.product.unit?.symbol ?? ""}
                                  {showFinance && b.costPerUnit != null
                                    ? ` · ${formatMoney(b.costPerUnit)}`
                                    : ""}
                                  {b.notes ? ` · ${b.notes}` : ""}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div>
                          <div className="mb-2 text-xs font-bold uppercase text-muted">
                            По магазинам
                          </div>
                          {row.stores.length === 0 ? (
                            <p className="text-sm text-muted">Только на складе</p>
                          ) : (
                            <ul className="space-y-1 text-sm">
                              {row.stores.map((s) => (
                                <li key={s.storeId} className="text-muted">
                                  {s.storeName}: {s.qty}
                                  {row.product.unit?.symbol ?? ""}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </DataTableBody>
        </DataTableElement>
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-muted">Нет остатков</div>
        ) : null}
      </DataTable>
    </div>
  );
}
