"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";
import { labelAction, labelEntity, labelRole } from "@/lib/i18n/labels";

type LogRow = {
  id: string;
  createdAt: string;
  userName: string | null;
  role: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  comment: string | null;
  result: string | null;
};

type Tab = "all" | "warehouse" | "sales" | "users";

export default function JournalPage() {
  const { t, formatDate, formatTime } = useI18n();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      const res = await fetch("/api/journal");
      const data = await res.json();
      if (!alive) return;
      if (res.ok && Array.isArray(data)) setRows(data);
      setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((log) => {
      const blob =
        `${log.action} ${log.entityType} ${log.userName ?? ""} ${log.comment ?? ""}`.toLowerCase();
      const matchQ = !q.trim() || blob.includes(q.toLowerCase());
      if (!matchQ) return false;
      if (tab === "warehouse")
        return /warehouse|batch|transfer|stock|product|return|write/i.test(blob);
      if (tab === "sales") return /sale|discount|pos|payment/i.test(blob);
      if (tab === "users") return /user|password|login|role/i.test(blob);
      return true;
    });
  }, [rows, tab, q]);

  const tabs: { id: Tab; labelKey: string }[] = [
    { id: "all", labelKey: "journalPage.tabAll" },
    { id: "warehouse", labelKey: "journalPage.tabWarehouse" },
    { id: "sales", labelKey: "journalPage.tabSales" },
    { id: "users", labelKey: "journalPage.tabUsers" },
  ];

  return (
    <ModuleWorkspace
      title={t("journalPage.title")}
      subtitle={t("journalPage.subtitle")}
      kpis={[
        {
          label: t("journalPage.loaded"),
          value: loading ? "…" : String(rows.length),
        },
        {
          label: t("journalPage.onScreen"),
          value: loading ? "…" : String(filtered.length),
        },
        {
          label: t("journalPage.deletion"),
          value: t("journalPage.deletionValue"),
          hint: t("journalPage.deletionHint"),
        },
      ]}
    >
      <div className="mb-4 flex flex-wrap gap-1.5">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-xl px-3.5 py-2 text-sm font-semibold",
              tab === item.id
                ? "bg-brand text-white"
                : "bg-card text-muted ring-1 ring-border"
            )}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("journalPage.search")}
        className="mb-4 w-full max-w-lg rounded-xl border border-border bg-card px-3 py-2 text-sm"
      />

      <ModuleSection title={t("journalPage.log")}>
        {loading ? (
          <Card className="p-5 text-sm text-muted">{t("common.loading")}</Card>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted">
            {t("journalPage.empty")}
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-page/80 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">
                      {t("journalPage.colDate")}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t("journalPage.colTime")}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t("journalPage.colUser")}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t("journalPage.colRole")}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t("journalPage.colAction")}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t("journalPage.colObject")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log) => {
                    const d = new Date(log.createdAt);
                    return (
                      <tr
                        key={log.id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-4 py-3 tabular-nums text-muted">
                          {formatDate(d, {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted">
                          {formatTime(d)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-ink">
                          {log.userName ?? t("journalPage.system")}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {labelRole(log.role, t)}
                        </td>
                        <td className="px-4 py-3 text-ink">
                          {labelAction(log.action, t)}
                          {log.comment ? (
                            <span className="block text-xs text-muted">
                              {log.comment}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {labelEntity(log.entityType, t)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </ModuleSection>
    </ModuleWorkspace>
  );
}
