"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { useI18n } from "@/components/i18n/i18n-provider";
import { labelAction, labelEntity, labelRole } from "@/lib/i18n/labels";
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

const WAREHOUSE_ACTIONS = new Set([
  "PRODUCT_CREATE",
  "PRODUCT_UPDATE",
  "BATCH_CREATE",
  "TRANSFER_CREATE",
  "WAREHOUSE_RETURN_IN",
  "PRICE_CHANGE",
  "CATEGORY_CREATE",
  "BRAND_CREATE",
]);

export default function WarehouseHistoryPage() {
  const { t, formatDateTime } = useI18n();
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

  function actionLabel(action: string): string {
    if (action === "BATCH_CREATE") return t("wh.actionBatch");
    if (action === "TRANSFER_CREATE") return t("wh.actionTransfer");
    if (action === "WAREHOUSE_RETURN_IN") return t("wh.actionReturn");
    return labelAction(action, t);
  }

  return (
    <div>
      <PageHeader
        title={t("wh.historyTitle")}
        subtitle={t("journalPage.deletionHint")}
      />

      <DataTableToolbar search={q} onSearchChange={setQ} />

      <DataTable>
        <DataTableElement>
          <DataTableHead>
            <DataTableTh>{t("journalPage.colDate")}</DataTableTh>
            <DataTableTh>{t("journalPage.colUser")}</DataTableTh>
            <DataTableTh>{t("journalPage.colAction")}</DataTableTh>
            <DataTableTh>{t("warehouse.productBatchNotes")}</DataTableTh>
            <DataTableTh>IP</DataTableTh>
          </DataTableHead>
          <DataTableBody>
            {filtered.map((row) => (
              <DataTableRow key={row.id}>
                <DataTableTd className="whitespace-nowrap text-xs">
                  {formatDateTime(row.createdAt)}
                </DataTableTd>
                <DataTableTd>
                  <div className="text-sm">{row.user?.name ?? t("journalPage.system")}</div>
                  <div className="text-xs text-muted">
                    {row.user?.role ? labelRole(row.user.role, t) : "—"}
                  </div>
                </DataTableTd>
                <DataTableTd>
                  <span className="font-medium">
                    {WAREHOUSE_ACTIONS.has(row.action)
                      ? actionLabel(row.action)
                      : labelAction(row.action, t)}
                  </span>
                  <div className="text-xs text-muted">
                    {labelEntity(row.entityType, t)}
                  </div>
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
          <div className="py-10 text-center text-muted">{t("journalPage.empty")}</div>
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
