"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import {
  DataTable,
  DataTableBody,
  DataTableElement,
  DataTableHead,
  DataTablePagination,
  DataTableRow,
  DataTableTd,
  DataTableTh,
  DataTableToolbar,
} from "@/components/ui/data-table";

type LogRow = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  comment: string | null;
  ip: string | null;
  user: { name: string; role: string } | null;
};

const ACTION_LABELS: Record<string, string> = {
  PRODUCT_CREATE: "Создание товара",
  PRODUCT_UPDATE: "Изменение товара",
  BATCH_CREATE: "Поступление / партия",
  TRANSFER_CREATE: "Перемещение в магазин",
  WAREHOUSE_RETURN_IN: "Возврат из магазина",
  PRICE_CHANGE: "Изменение цены",
  CATEGORY_CREATE: "Категория",
  BRAND_CREATE: "Бренд",
};

export default function WarehouseHistoryPage() {
  const [items, setItems] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const pageSize = 30;

  useEffect(() => {
    fetch(`/api/warehouse/history?limit=${pageSize}&offset=${(page - 1) * pageSize}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setTotal(d.total ?? 0);
      });
  }, [page]);

  const filtered = items.filter((row) => {
    if (!q.trim()) return true;
    const hay = `${row.action} ${row.comment ?? ""} ${row.user?.name ?? ""}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <PageHeader
        title="История склада"
        subtitle="Неизменяемый журнал операций · только чтение"
      />

      <DataTableToolbar search={q} onSearchChange={setQ} />

      <DataTable>
        <DataTableElement>
          <DataTableHead>
            <DataTableTh>Дата / время</DataTableTh>
            <DataTableTh>Пользователь</DataTableTh>
            <DataTableTh>Действие</DataTableTh>
            <DataTableTh>Комментарий</DataTableTh>
            <DataTableTh>IP</DataTableTh>
          </DataTableHead>
          <DataTableBody>
            {filtered.map((row) => (
              <DataTableRow key={row.id}>
                <DataTableTd className="whitespace-nowrap text-xs">
                  {new Date(row.createdAt).toLocaleString("ru-RU")}
                </DataTableTd>
                <DataTableTd>
                  <div className="text-sm">{row.user?.name ?? "Система"}</div>
                  <div className="text-xs text-muted">{row.user?.role ?? "—"}</div>
                </DataTableTd>
                <DataTableTd>
                  <span className="font-medium">
                    {ACTION_LABELS[row.action] ?? row.action}
                  </span>
                  <div className="text-xs text-muted">{row.entityType}</div>
                </DataTableTd>
                <DataTableTd className="max-w-xs truncate text-sm text-muted">
                  {row.comment ?? "—"}
                </DataTableTd>
                <DataTableTd className="text-xs text-muted">{row.ip ?? "—"}</DataTableTd>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTableElement>
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-muted">Нет записей</div>
        ) : null}
        <DataTablePagination
          page={page}
          pages={pages}
          total={total}
          onPageChange={setPage}
        />
      </DataTable>
    </div>
  );
}
