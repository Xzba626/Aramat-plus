"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { cn } from "@/lib/utils";
import type { DashboardPayload } from "@/lib/services/dashboard.service";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

type Decision = DashboardPayload["decisions"][number];
type Tab = "pending" | "history";

type HistoryRow = {
  id: string;
  createdAt: string;
  status: string;
  reason: string | null;
  store: string;
  seller: string;
  product: string;
  amount: number;
};

export default function ReturnsPage() {
  const { t, formatMoney, formatDateTime } = useI18n();
  const { data: session } = useSession();
  const canDecide = session?.user?.role === Role.OWNER;
  const [tab, setTab] = useState<Tab>("pending");
  const [pending, setPending] = useState<Decision[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const [dashRes, histRes] = await Promise.all([
      fetch("/api/dashboard"),
      fetch("/api/returns"),
    ]);
    const dash = await dashRes.json();
    const hist = await histRes.json();
    if (dashRes.ok) {
      setPending(
        (dash as DashboardPayload).decisions.filter((d) => d.type === "RETURN")
      );
    }
    if (histRes.ok && Array.isArray(hist)) {
      setHistory(hist);
    } else if (!histRes.ok) {
      setError(apiErrorMessage(hist.error, t, "common.error"));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    reload();
  }, [reload]);

  const filteredHistory = useMemo(() => {
    return history.filter((r) => {
      const matchQ =
        !q.trim() ||
        `${r.store} ${r.seller} ${r.product} ${r.reason ?? ""}`
          .toLowerCase()
          .includes(q.toLowerCase());
      const matchS = status === "ALL" || r.status === status;
      return matchQ && matchS;
    });
  }, [history, q, status]);

  async function decide(id: string, decision: "APPROVE" | "REJECT") {
    setBusyId(id);
    setError("");
    const res = await fetch(`/api/returns/${id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    setMsg(
      decision === "APPROVE"
        ? t("returnsPage.approved")
        : t("returnsPage.rejected")
    );
    await reload();
  }

  const returnStatusLabel = (value: string) => {
    if (value === "PENDING") return t("returnsPage.statusPending");
    if (value === "APPROVED") return t("returnsPage.statusApproved");
    if (value === "REJECTED") return t("returnsPage.statusRejected");
    return value;
  };

  const decisionTitle = (d: Decision) =>
    d.titleKey ? t(d.titleKey) : t("dashboard.decisionReturn");

  return (
    <ModuleWorkspace
      title={t("returnsPage.title")}
      subtitle={t("returnsPage.subtitle")}
      kpis={[
        {
          label: t("returnsPage.pending"),
          value: loading ? "…" : String(pending.length),
        },
        {
          label: t("returnsPage.history"),
          value: String(history.length),
        },
      ]}
    >
      <p className="mb-4 rounded-xl border border-border bg-page px-4 py-3 text-sm text-muted">
        {t("returnsPage.customerReturnsHint")}
      </p>

      <div className="mb-5 flex flex-wrap gap-1.5 border-b border-border pb-3">
        {(
          [
            ["pending", "returnsPage.pending"],
            ["history", "returnsPage.history"],
          ] as const
        ).map(([id, labelKey]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "rounded-xl px-3.5 py-2 text-sm font-semibold transition",
              tab === id
                ? "bg-brand text-white"
                : "bg-card text-muted ring-1 ring-border hover:text-ink"
            )}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {msg ? <p className="mb-4 text-sm text-success">{msg}</p> : null}
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      {tab === "pending" ? (
        <ModuleSection title={t("returnsPage.sellersRequests")}>
          {loading ? (
            <Card className="p-5 text-sm text-muted">
              {t("returnsPage.loading")}
            </Card>
          ) : pending.length === 0 ? (
            <Card className="border-success/20 bg-success/5 p-5 text-sm text-success">
              {t("returnsPage.noPending")}
            </Card>
          ) : (
            <div className="space-y-3">
              {pending.map((d) => (
                <Card key={d.id} className="border-l-4 border-l-warning p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-ink">
                        {decisionTitle(d)}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {formatDateTime(d.createdAt)} · {d.storeName} ·{" "}
                        {d.actorName}
                      </div>
                      <div className="mt-2 text-sm text-ink">{d.products}</div>
                      <div className="mt-1 text-sm text-muted">
                        {d.reason || "—"}
                        {d.originalTotal != null
                          ? ` · ${t("storeDetail.receipt")} ${formatMoney(d.originalTotal)}`
                          : ""}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {canDecide ? (
                        <>
                      <Button
                        type="button"
                        fullWidth={false}
                        disabled={busyId === d.id}
                        onClick={() => decide(d.id, "APPROVE")}
                      >
                        {t("common.approve")}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        fullWidth={false}
                        disabled={busyId === d.id}
                        onClick={() => decide(d.id, "REJECT")}
                      >
                        {t("common.reject")}
                      </Button>
                        </>
                      ) : (
                        <span className="text-xs text-muted">
                          {t("returnsPage.statusPending")}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </ModuleSection>
      ) : null}

      {tab === "history" ? (
        <ModuleSection title={t("returnsPage.history")}>
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("common.search")}
              className="min-w-[180px] flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="ALL">{t("storeDetail.allStatuses")}</option>
              <option value="PENDING">{t("returnsPage.statusPending")}</option>
              <option value="APPROVED">
                {t("returnsPage.statusApproved")}
              </option>
              <option value="REJECTED">
                {t("returnsPage.statusRejected")}
              </option>
            </select>
          </div>
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
                      {t("common.seller")}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t("wh.colName")}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t("storeDetail.amount")}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t("wh.colStatus")}
                    </th>
                    <th className="px-4 py-3 font-semibold">{t("wh.open")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3 text-muted">
                        {formatDateTime(r.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-ink">{r.store}</td>
                      <td className="px-4 py-3 text-muted">{r.seller}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink">{r.product}</div>
                        <div className="text-xs text-muted">{r.reason}</div>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatMoney(r.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-semibold",
                            r.status === "APPROVED" &&
                              "bg-success/10 text-success",
                            r.status === "REJECTED" &&
                              "bg-danger/10 text-danger",
                            r.status === "PENDING" &&
                              "bg-warning/15 text-warning"
                          )}
                        >
                          {returnStatusLabel(r.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {r.status === "PENDING" && canDecide ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="text-xs font-semibold text-brand"
                              disabled={busyId === r.id}
                              onClick={() => decide(r.id, "APPROVE")}
                            >
                              {t("common.approve")}
                            </button>
                            <button
                              type="button"
                              className="text-xs font-semibold text-muted"
                              disabled={busyId === r.id}
                              onClick={() => decide(r.id, "REJECT")}
                            >
                              {t("common.reject")}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && filteredHistory.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted">
                {t("journalPage.empty")}
              </div>
            ) : null}
          </Card>
        </ModuleSection>
      ) : null}

      <div className="mt-8 border-t border-border pt-4">
        <p className="text-xs text-muted">{t("returnsPage.warehouseReturnRareHint")}</p>
        <Link
          href="/warehouse/return-in"
          className="mt-2 inline-flex text-sm font-medium text-muted underline-offset-2 hover:text-brand hover:underline"
        >
          {t("returnsPage.warehouseReturnRare")} →
        </Link>
      </div>
    </ModuleWorkspace>
  );
}
