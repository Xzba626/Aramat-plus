"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";
import { useToast } from "@/components/ui/toast";

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

type DetailItem = {
  productId: string;
  name: string;
  unit: string;
  expectedQty: number;
  countedQty: number;
  difference: number;
  reason: string | null;
};

type StoreOpt = { id: string; name: string };

export default function RevisionPage() {
  const { t, formatDateTime } = useI18n();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    id: string;
    status: string;
    store: string;
    items: DetailItem[];
  } | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});

  async function reload() {
    const [revRes, storesRes] = await Promise.all([
      fetch("/api/revisions"),
      fetch("/api/stores"),
    ]);
    const rev = await revRes.json();
    const st = await storesRes.json();
    if (revRes.ok && Array.isArray(rev)) setRows(rev);
    else setError(apiErrorMessage(rev.error, t, "common.error"));
    if (storesRes.ok && Array.isArray(st)) {
      setStores(
        st
          .filter((s: { kind?: string; isActive?: boolean }) => s.kind === "BRANCH" && s.isActive !== false)
          .map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchQ =
        !q.trim() ||
        `${r.store} ${r.createdBy}`.toLowerCase().includes(q.toLowerCase());
      const matchS = status === "ALL" || r.status === status;
      return matchQ && matchS;
    });
  }, [rows, q, status]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const res = await fetch("/api/revisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId: String(fd.get("storeId")),
        comment: String(fd.get("comment") || "") || null,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    toast(t("revisionPage.created"));
    e.currentTarget.reset();
    await reload();
    await openDetail(data.id);
  }

  async function openDetail(id: string) {
    setActiveId(id);
    const res = await fetch(`/api/revisions?id=${id}`);
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    setDetail(data);
    const next: Record<string, string> = {};
    for (const it of data.items as DetailItem[]) {
      next[it.productId] = String(it.countedQty);
    }
    setCounts(next);
  }

  async function saveCounts() {
    if (!detail) return;
    setBusy(true);
    const items = Object.entries(counts).map(([productId, countedQty]) => ({
      productId,
      countedQty: Number(countedQty),
    }));
    const res = await fetch(`/api/revisions?id=${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    toast(t("revisionPage.countsSaved"));
    await openDetail(detail.id);
    await reload();
  }

  async function decide(decision: "APPROVE" | "CANCEL") {
    if (!detail) return;
    setBusy(true);
    const res = await fetch(`/api/revisions?id=${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    toast(
      decision === "APPROVE"
        ? t("revisionPage.approved")
        : t("revisionPage.cancelled")
    );
    setDetail(null);
    setActiveId(null);
    await reload();
  }

  const revisionStatusLabel = (value: string) => {
    if (value === "IN_PROGRESS") return t("revisionPage.statusInProgress");
    if (value === "COMPLETED") return t("revisionPage.statusApproved");
    if (value === "CANCELLED") return t("common.cancel");
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
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      <ModuleSection title={t("revisionPage.newTitle")}>
        <Card className="max-w-lg p-4">
          <form onSubmit={onCreate} className="space-y-3">
            <div>
              <FieldLabel>{t("common.store")}</FieldLabel>
              <select name="storeId" required className="w-full rounded-xl border border-border bg-page px-3 py-2 text-sm">
                <option value="">{t("common.search")}</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>{t("common.notes")}</FieldLabel>
              <input name="comment" className="w-full rounded-xl border border-border bg-page px-3 py-2 text-sm" />
            </div>
            <Button type="submit" disabled={busy} fullWidth={false}>
              {t("revisionPage.start")}
            </Button>
          </form>
        </Card>
      </ModuleSection>

      {detail ? (
        <ModuleSection title={`${t("revisionPage.title")}: ${detail.store}`}>
          <Card className="mb-3 flex flex-wrap gap-2 p-3">
            <span className="text-sm text-muted">
              {revisionStatusLabel(detail.status)}
            </span>
            {detail.status === "IN_PROGRESS" ? (
              <>
                <Button type="button" fullWidth={false} disabled={busy} onClick={saveCounts}>
                  {t("revisionPage.saveCounts")}
                </Button>
                <Button type="button" fullWidth={false} disabled={busy} onClick={() => decide("APPROVE")}>
                  {t("revisionPage.approve")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth={false}
                  disabled={busy}
                  onClick={() => decide("CANCEL")}
                >
                  {t("common.cancel")}
                </Button>
              </>
            ) : (
              <Button type="button" variant="secondary" fullWidth={false} onClick={() => setDetail(null)}>
                {t("common.close")}
              </Button>
            )}
          </Card>
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-page text-left text-xs text-muted">
                <tr>
                  <th className="p-3">{t("wh.colName")}</th>
                  <th className="p-3">{t("revisionPage.expected")}</th>
                  <th className="p-3">{t("revisionPage.actual")}</th>
                  <th className="p-3">{t("revisionPage.diff")}</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((it) => (
                  <tr key={it.productId} className="border-t border-border">
                    <td className="p-3">{it.name}</td>
                    <td className="p-3">
                      {it.expectedQty} {it.unit}
                    </td>
                    <td className="p-3">
                      {detail.status === "IN_PROGRESS" ? (
                        <input
                          className="w-24 rounded border border-border px-2 py-1"
                          value={counts[it.productId] ?? ""}
                          onChange={(e) =>
                            setCounts((c) => ({
                              ...c,
                              [it.productId]: e.target.value,
                            }))
                          }
                        />
                      ) : (
                        it.countedQty
                      )}
                    </td>
                    <td className="p-3">{it.difference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </ModuleSection>
      ) : null}

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
          <option value="IN_PROGRESS">{t("revisionPage.statusInProgress")}</option>
          <option value="COMPLETED">{t("revisionPage.statusApproved")}</option>
          <option value="CANCELLED">{t("common.cancel")}</option>
        </select>
      </div>

      <ModuleSection title={t("revisionPage.title")}>
        <div className="space-y-2">
          {filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => openDetail(r.id)}
              className={cn(
                "w-full rounded-xl border border-border bg-card p-4 text-left",
                activeId === r.id && "border-brand"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-ink">{r.store}</div>
                <div className="text-xs text-muted">{revisionStatusLabel(r.status)}</div>
              </div>
              <div className="mt-1 text-sm text-muted">
                {r.createdBy} · {formatDateTime(r.createdAt)} · {r.itemCount} · Δ{" "}
                {r.varianceAbs}
              </div>
            </button>
          ))}
          {!loading && filtered.length === 0 ? (
            <p className="text-sm text-muted">{t("common.noData")}</p>
          ) : null}
        </div>
      </ModuleSection>
    </ModuleWorkspace>
  );
}
