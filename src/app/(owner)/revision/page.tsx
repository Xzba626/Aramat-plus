"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Role } from "@prisma/client";
import { useSession } from "next-auth/react";
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
  expectedQty?: number;
  countedQty: number | null;
  difference?: number;
  reason: string | null;
};

type Detail = {
  id: string;
  status: string;
  store: string;
  blind: boolean;
  itemCount: number;
  items: DetailItem[];
};

type StoreOpt = { id: string; name: string };

function isFactFilled(raw: string | undefined): boolean {
  if (raw == null) return false;
  const s = raw.trim();
  if (s === "") return false;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0;
}

export default function RevisionPage() {
  const { t, formatDateTime } = useI18n();
  const { toast } = useToast();
  const { data: session } = useSession();
  const isOwner = session?.user?.role === Role.OWNER;

  const [rows, setRows] = useState<Row[]>([]);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [countModal, setCountModal] = useState<Detail | null>(null);
  const [reviewDetail, setReviewDetail] = useState<Detail | null>(null);
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
          .filter(
            (s: { kind?: string; isActive?: boolean }) =>
              s.kind === "BRANCH" && s.isActive !== false
          )
          .map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const allFactsFilled = useMemo(() => {
    if (!countModal || countModal.status !== "IN_PROGRESS") return false;
    if (countModal.items.length === 0) return false;
    return countModal.items.every((it) => isFactFilled(counts[it.productId]));
  }, [countModal, counts]);

  function toDetail(data: Record<string, unknown>): Detail {
    return {
      id: String(data.id),
      status: String(data.status),
      store: String(data.store),
      blind: Boolean(data.blind),
      itemCount: Number(data.itemCount ?? (data.items as unknown[])?.length ?? 0),
      items: Array.isArray(data.items) ? (data.items as DetailItem[]) : [],
    };
  }

  async function fetchDetail(id: string): Promise<Detail | null> {
    const res = await fetch(`/api/revisions?id=${id}`);
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      return null;
    }
    return toDetail(data);
  }

  async function openSession(id: string) {
    setActiveId(id);
    const detail = await fetchDetail(id);
    if (!detail) return;

    if (detail.status === "IN_PROGRESS") {
      const next: Record<string, string> = {};
      for (const it of detail.items) {
        next[it.productId] =
          it.countedQty == null ? "" : String(it.countedQty);
      }
      setCounts(next);
      setReviewDetail(null);
      setCountModal(detail);
      return;
    }

    setCountModal(null);
    setReviewDetail(detail);
  }

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
    await openSession(data.id);
  }

  async function completeCounting() {
    if (!countModal || !allFactsFilled) return;
    setBusy(true);
    setError("");

    const items = countModal.items.map((it) => ({
      productId: it.productId,
      countedQty: Number(String(counts[it.productId]).trim()),
    }));

    const saveRes = await fetch(`/api/revisions?id=${countModal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const saveData = await saveRes.json();
    if (!saveRes.ok) {
      setBusy(false);
      setError(apiErrorMessage(saveData.error, t, "common.error"));
      return;
    }

    const submitRes = await fetch(`/api/revisions?id=${countModal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "SUBMIT" }),
    });
    const submitData = await submitRes.json();
    setBusy(false);
    if (!submitRes.ok) {
      setError(apiErrorMessage(submitData.error, t, "common.error"));
      return;
    }

    toast(t("revisionPage.submittedForReview"));
    setCountModal(null);
    setActiveId(null);
    setCounts({});
    await reload();
  }

  async function decide(decision: "APPROVE" | "CANCEL") {
    const target = reviewDetail ?? countModal;
    if (!target) return;
    setBusy(true);
    const res = await fetch(`/api/revisions?id=${target.id}`, {
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
    setReviewDetail(null);
    setCountModal(null);
    setActiveId(null);
    await reload();
  }

  const revisionStatusLabel = (value: string) => {
    if (value === "IN_PROGRESS") return t("revisionPage.statusInProgress");
    if (value === "PENDING_APPROVAL")
      return t("revisionPage.statusPendingApproval");
    if (value === "COMPLETED") return t("revisionPage.statusApproved");
    if (value === "CANCELLED") return t("revisionPage.statusCancelled");
    return value;
  };

  const inProgressCount = rows.filter((r) => r.status === "IN_PROGRESS").length;
  const pendingCount = rows.filter(
    (r) => r.status === "PENDING_APPROVAL"
  ).length;

  const showDiscrepancyTable =
    reviewDetail != null &&
    isOwner &&
    !reviewDetail.blind &&
    reviewDetail.items.length > 0 &&
    (reviewDetail.status === "PENDING_APPROVAL" ||
      reviewDetail.status === "COMPLETED" ||
      reviewDetail.status === "CANCELLED");

  return (
    <ModuleWorkspace
      title={t("revisionPage.title")}
      subtitle={t("revisionPage.subtitle")}
      kpis={[
        {
          label: t("revisionPage.statusInProgress"),
          value: loading ? "…" : String(inProgressCount),
        },
        {
          label: t("revisionPage.statusPendingApproval"),
          value: loading ? "…" : String(pendingCount),
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
      <p className="mb-4 text-sm text-muted">{t("revisionPage.flowHint")}</p>
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      <ModuleSection title={t("revisionPage.newTitle")}>
        <Card className="max-w-lg p-4">
          <form onSubmit={onCreate} className="space-y-3">
            <div>
              <FieldLabel>{t("common.store")}</FieldLabel>
              <select
                name="storeId"
                required
                className="w-full rounded-xl border border-border bg-page px-3 py-2 text-sm"
              >
                <option value="">{t("revisionPage.pickStore")}</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>{t("common.notes")}</FieldLabel>
              <input
                name="comment"
                className="w-full rounded-xl border border-border bg-page px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" disabled={busy} fullWidth={false}>
              {t("revisionPage.start")}
            </Button>
          </form>
        </Card>
      </ModuleSection>

      {reviewDetail ? (
        <ModuleSection
          title={t("revisionPage.countFormTitle", { store: reviewDetail.store })}
        >
          <Card className="mb-3 flex flex-wrap items-center gap-2 p-3">
            <span className="text-sm text-muted">
              {revisionStatusLabel(reviewDetail.status)}
            </span>
            <span className="text-sm text-muted">
              · {t("revisionPage.itemsCount", { count: reviewDetail.itemCount })}
            </span>
            {reviewDetail.status === "PENDING_APPROVAL" && isOwner ? (
              <>
                <Button
                  type="button"
                  fullWidth={false}
                  disabled={busy}
                  onClick={() => decide("APPROVE")}
                >
                  {t("revisionPage.confirm")}
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
              <Button
                type="button"
                variant="secondary"
                fullWidth={false}
                onClick={() => {
                  setReviewDetail(null);
                  setActiveId(null);
                }}
              >
                {t("common.close")}
              </Button>
            )}
          </Card>

          {reviewDetail.status === "PENDING_APPROVAL" ? (
            <p className="mb-3 text-sm text-muted">
              {t("revisionPage.pendingHint")}
            </p>
          ) : null}

          {showDiscrepancyTable ? (
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="bg-page text-left text-xs text-muted">
                    <tr>
                      <th className="p-3">{t("wh.colName")}</th>
                      <th className="p-3">{t("revisionPage.expected")}</th>
                      <th className="p-3">{t("revisionPage.actual")}</th>
                      <th className="p-3">{t("revisionPage.diff")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewDetail.items.map((it) => (
                      <tr key={it.productId} className="border-t border-border">
                        <td className="p-3">{it.name}</td>
                        <td className="p-3 tabular-nums">
                          {it.expectedQty} {it.unit}
                        </td>
                        <td className="p-3 tabular-nums">
                          {it.countedQty} {it.unit}
                        </td>
                        <td
                          className={cn(
                            "p-3 tabular-nums font-semibold",
                            (it.difference ?? 0) > 0 && "text-success",
                            (it.difference ?? 0) < 0 && "text-danger"
                          )}
                        >
                          {(it.difference ?? 0) > 0 ? "+" : ""}
                          {it.difference}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <Card className="p-5 text-sm text-muted">
              {t("revisionPage.managerCompletedHint")}
            </Card>
          )}
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
          <option value="PENDING_APPROVAL">
            {t("revisionPage.statusPendingApproval")}
          </option>
          <option value="COMPLETED">{t("revisionPage.statusApproved")}</option>
          <option value="CANCELLED">{t("revisionPage.statusCancelled")}</option>
        </select>
      </div>

      <ModuleSection title={t("revisionPage.allRevisions")}>
        <div className="space-y-2">
          {filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => openSession(r.id)}
              className={cn(
                "w-full rounded-xl border border-border bg-card p-4 text-left",
                activeId === r.id && "border-brand"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-ink">{r.store}</div>
                <div className="text-xs text-muted">
                  {revisionStatusLabel(r.status)}
                </div>
              </div>
              <div className="mt-1 text-sm text-muted">
                {r.createdBy} · {formatDateTime(r.createdAt)} ·{" "}
                {t("revisionPage.itemsCount", { count: r.itemCount })}
                {isOwner &&
                (r.status === "COMPLETED" || r.status === "PENDING_APPROVAL")
                  ? ` · Δ ${r.varianceAbs}`
                  : ""}
              </div>
            </button>
          ))}
          {!loading && filtered.length === 0 ? (
            <p className="text-sm text-muted">{t("common.noData")}</p>
          ) : null}
        </div>
      </ModuleSection>

      {countModal ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("revisionPage.countFormTitle", {
            store: countModal.store,
          })}
        >
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl bg-card shadow-xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="text-base font-bold text-ink">
                  {t("revisionPage.countFormTitle", { store: countModal.store })}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {t("revisionPage.itemsCount", {
                    count: countModal.items.length,
                  })}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                fullWidth={false}
                disabled={busy}
                onClick={() => decide("CANCEL")}
              >
                {t("common.cancel")}
              </Button>
            </div>

            <p className="px-4 pt-3 text-sm text-muted">
              {t("revisionPage.factAbsoluteHint")}
            </p>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {countModal.items.length === 0 ? (
                <p className="text-sm text-muted">
                  {t("revisionPage.noItemsInStore")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {countModal.items.map((it) => (
                    <li
                      key={it.productId}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          {it.name}
                        </p>
                        {it.unit ? (
                          <p className="text-xs text-muted">{it.unit}</p>
                        ) : null}
                      </div>
                      <input
                        className="w-28 shrink-0 rounded-lg border border-border px-2 py-1.5 text-right tabular-nums"
                        inputMode="decimal"
                        placeholder="—"
                        value={counts[it.productId] ?? ""}
                        onChange={(e) =>
                          setCounts((c) => ({
                            ...c,
                            [it.productId]: e.target.value,
                          }))
                        }
                        aria-label={`${it.name} ${t("revisionPage.actual")}`}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-border px-4 py-3">
              <Button
                type="button"
                disabled={busy || !allFactsFilled}
                onClick={completeCounting}
                title={
                  allFactsFilled
                    ? undefined
                    : t("revisionPage.completeBlockedHint")
                }
              >
                {t("revisionPage.complete")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </ModuleWorkspace>
  );
}
