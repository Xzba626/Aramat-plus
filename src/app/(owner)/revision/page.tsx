"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

type Row = {
  id: string;
  storeId: string;
  store: string;
  createdBy: string;
  status: string;
  createdAt: string;
  itemCount: number;
  varianceAbs: number;
  comment: string | null;
};

export default function RevisionPage() {
  const { t, formatDateTime } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");

  useEffect(() => {
    fetch("/api/revisions")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setRows(d);
        else setError(apiErrorMessage(d.error, t, "common.error"));
        setLoading(false);
      })
      .catch(() => {
        setError(t("common.error"));
        setLoading(false);
      });
  }, [t]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchQ =
        !q.trim() ||
        `${r.store} ${r.createdBy}`.toLowerCase().includes(q.toLowerCase());
      const matchS = status === "ALL" || r.status === status;
      return matchQ && matchS;
    });
  }, [rows, q, status]);

  const revisionStatusLabel = (value: string) => {
    if (value === "IN_PROGRESS") return t("revisionPage.statusInProgress");
    if (value === "COMPLETED") return t("revisionPage.statusApproved");
    if (value === "CANCELLED") return t("common.cancel");
    if (value === "PENDING_APPROVAL")
      return t("revisionPage.statusPendingApproval");
    if (value === "APPROVED") return t("revisionPage.statusApproved");
    return value;
  };

  return (
    <ModuleWorkspace
      title={t("revisionPage.title")}
      subtitle={t("revisionPage.subtitle")}
      kpis={[
        {
          label: t("revisionPage.actual"),
          value: loading
            ? "…"
            : String(rows.filter((r) => r.status === "IN_PROGRESS").length),
        },
        {
          label: t("revisionPage.title"),
          value: loading ? "…" : String(rows.length),
        },
      ]}
      actions={
        <Link href="/stores">
          <Button type="button" variant="secondary" fullWidth={false}>
            {t("common.store")}
          </Button>
        </Link>
      }
    >
      <Card className="mb-4 border-warning/30 bg-warning/5 p-4 text-sm text-ink">
        {t("revisionPage.listHint")}
      </Card>

      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("common.search")}
          className="min-w-[200px] flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="ALL">{t("storeDetail.allStatuses")}</option>
          <option value="IN_PROGRESS">
            {t("revisionPage.statusInProgress")}
          </option>
          <option value="COMPLETED">{t("revisionPage.statusApproved")}</option>
          <option value="CANCELLED">{t("common.cancel")}</option>
        </select>
      </div>

      <ModuleSection title={t("revisionPage.title")}>
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-page/80 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">
                    {t("storeDetail.date")}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("common.store")}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("roles.manager")}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("wh.colStatus")}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("revisionPage.diff")}
                  </th>
                  <th className="px-4 py-3 font-semibold">{t("wh.open")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3 text-muted">
                      {formatDateTime(r.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-ink">
                      {r.store}
                    </td>
                    <td className="px-4 py-3 text-muted">{r.createdBy}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          r.status === "COMPLETED" &&
                            "bg-success/10 text-success",
                          r.status === "IN_PROGRESS" &&
                            "bg-info/10 text-info",
                          r.status === "CANCELLED" &&
                            "bg-danger/10 text-danger"
                        )}
                      >
                        {revisionStatusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted">
                      {r.itemCount} / {r.varianceAbs}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/stores/${r.storeId}?tab=revisions`}
                        className="text-sm font-semibold text-brand hover:underline"
                      >
                        {t("wh.open")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted">
              {t("journalPage.empty")}
            </div>
          ) : null}
        </Card>
      </ModuleSection>
    </ModuleWorkspace>
  );
}
