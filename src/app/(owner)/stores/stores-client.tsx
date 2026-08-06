"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Role } from "@prisma/client";
import { isOwnerClass } from "@/lib/rbac";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel, SectionTitle } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";
import { labelStoreStatus, apiErrorMessage, labelRole } from "@/lib/i18n/labels";
import { HelpTip } from "@/components/ui/help-tip";

type StoreCard = {
  id: string;
  name: string;
  address?: string | null;
  kind: "BRANCH" | "OWNER_DIRECT";
  status: string;
  isArchived?: boolean;
  staffCount: number;
  skuCount: number;
  unitsTotal: number;
  stockCost: number;
  todaySalesCount: number;
  todayRevenue: number;
  todayProfit: number;
  monthRevenue: number;
  monthProfit: number;
  pendingRequests: number;
  lastSaleAt: string | null;
  lastRevisionAt: string | null;
};

type StaffCandidate = {
  id: string;
  name: string;
  email: string;
  role: string;
  storeId?: string | null;
};

type Props = {
  initialStores: StoreCard[];
};

export default function StoresClient({ initialStores }: Props) {
  const { t, formatMoney, formatDateTime } = useI18n();
  const { data: session } = useSession();
  const isOwner = isOwnerClass(session?.user?.role);
  const [stores, setStores] = useState<StoreCard[]>(initialStores);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [candidates, setCandidates] = useState<StaffCandidate[]>([]);
  const [sellerIds, setSellerIds] = useState<string[]>([]);
  const [managerId, setManagerId] = useState("");
  const [skipFirstArchivedLoad, setSkipFirstArchivedLoad] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch(
      `/api/stores${showArchived ? "?archived=1" : ""}`
    );
    const data = await res.json();
    if (res.ok) setStores(Array.isArray(data) ? data : []);
    else setError(apiErrorMessage(data.error, t, "storesPage.error"));
    setLoading(false);
  }

  async function loadCandidates() {
    const res = await fetch("/api/users");
    const data = await res.json();
    if (res.ok && Array.isArray(data)) {
      setCandidates(
        data.filter(
          (u: StaffCandidate) =>
            u.role === "SELLER" || u.role === "MANAGER"
        )
      );
    }
  }

  useEffect(() => {
    if (skipFirstArchivedLoad && !showArchived) {
      setSkipFirstArchivedLoad(false);
      setStores(initialStores);
      return;
    }
    setSkipFirstArchivedLoad(false);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  useEffect(() => {
    if (showForm) loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm]);

  const ownerDirect = useMemo(
    () => stores.find((s) => s.kind === "OWNER_DIRECT"),
    [stores]
  );
  const branches = useMemo(() => {
    const list = stores.filter((s) => s.kind !== "OWNER_DIRECT");
    if (showArchived) return list.filter((s) => s.isArchived);
    return list.filter((s) => !s.isArchived);
  }, [stores, showArchived]);

  const network = useMemo(() => {
    const list = branches;
    return {
      branchCount: list.length,
      todayRevenue:
        list.reduce((s, x) => s + x.todayRevenue, 0) +
        (ownerDirect?.todayRevenue ?? 0),
      todayProfit:
        list.reduce((s, x) => s + x.todayProfit, 0) +
        (ownerDirect?.todayProfit ?? 0),
      pending:
        list.reduce((s, x) => s + x.pendingRequests, 0) +
        (ownerDirect?.pendingRequests ?? 0),
    };
  }, [branches, ownerDirect]);

  async function createStore(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(fd.get("name")),
        address: String(fd.get("address") || "") || null,
        phone: String(fd.get("phone") || "") || null,
        managerId: managerId || null,
        sellerIds,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "storesPage.error"));
      return;
    }
    setShowForm(false);
    setSellerIds([]);
    setManagerId("");
    load();
  }

  async function archiveStore(id: string, archive: boolean) {
    setError("");
    const res = await fetch("/api/stores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isArchived: archive }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "storesPage.error"));
      return;
    }
    load();
  }

  async function deleteStore(id: string, permanent: boolean) {
    setError("");
    if (permanent) {
      if (!window.confirm(t("storesPage.deleteForeverConfirm"))) return;
    }
    const q = permanent ? "&force=1" : "";
    const res = await fetch(
      `/api/stores?id=${encodeURIComponent(id)}${q}`,
      { method: "DELETE" }
    );
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "storesPage.error"));
      return;
    }
    load();
  }

  function fmtOptionalDate(v: string | null, emptyKey: string) {
    if (!v) return t(emptyKey);
    return formatDateTime(v);
  }

  function toggleSeller(id: string) {
    setSellerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <div>
      <PageHeader
        title={t("storesPage.title")}
        count={
          loading
            ? null
            : showArchived
              ? branches.length || null
              : (branches.length + (ownerDirect ? 1 : 0)) || null
        }
        subtitle={t("storesPage.subtitle")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              fullWidth={false}
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? t("storesPage.showActive") : t("storesPage.showArchive")}
            </Button>
            {isOwner ? (
              <Button
                type="button"
                fullWidth={false}
                onClick={() => setShowForm((v) => !v)}
              >
                {showForm ? t("common.cancel") : t("storesPage.addBranch")}
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NetStat label={t("storesPage.branches")} value={loading ? "…" : String(network.branchCount)} />
        <NetStat
          label={t("storesPage.salesToday")}
          value={loading ? "…" : formatMoney(network.todayRevenue, { short: true })}
        />
        <NetStat
          label={t("storesPage.profitToday")}
          value={loading ? "…" : formatMoney(network.todayProfit, { short: true })}
          accent
        />
        <NetStat
          label={t("storesPage.pendingDecisions")}
          value={loading ? "…" : String(network.pending)}
          warn={!loading && network.pending > 0}
        />
      </div>

      {isOwner && showForm ? (
        <Card className="mb-6 max-w-lg p-4">
          <form onSubmit={createStore} className="space-y-3">
            <div>
              <FieldLabel>{t("storesPage.branchName")}</FieldLabel>
              <input name="name" required className="w-full" />
            </div>
            <div>
              <FieldLabel>{t("storesPage.address")}</FieldLabel>
              <input name="address" className="w-full" />
            </div>
            <div>
              <FieldLabel>{t("storesPage.phone")}</FieldLabel>
              <input name="phone" className="w-full" />
            </div>
            <div>
              <FieldLabel>{t("storesPage.assignManager")}</FieldLabel>
              <select
                className="w-full"
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
              >
                <option value="">{t("storesPage.noStaffYet")}</option>
                {candidates
                  .filter((c) => c.role === "MANAGER" || c.role === "SELLER")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {labelRole(c.role, t)}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <FieldLabel>{t("storesPage.assignSellers")}</FieldLabel>
              <p className="mb-2 text-xs text-muted">{t("storesPage.assignHint")}</p>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                {candidates.filter((c) => c.role === "SELLER").length === 0 ? (
                  <p className="text-xs text-muted">{t("storesPage.noCandidates")}</p>
                ) : (
                  candidates
                    .filter((c) => c.role === "SELLER")
                    .map((c) => (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-page"
                      >
                        <input
                          type="checkbox"
                          checked={sellerIds.includes(c.id)}
                          onChange={() => toggleSeller(c.id)}
                        />
                        <span>
                          {c.name} ({c.email})
                        </span>
                      </label>
                    ))
                )}
              </div>
            </div>
            <Button type="submit">{t("common.save")}</Button>
          </form>
        </Card>
      ) : null}

      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}

      {loading ? <LoadingBlock rows={4} label={t("common.loading")} /> : null}

      {!loading && ownerDirect && !showArchived ? (
        <Link
          href={`/stores/${ownerDirect.id}`}
          id="owner-direct"
          className="mb-6 block scroll-mt-24"
        >
          <Card className="h-full border-brand/30 bg-gradient-to-br from-brand-soft to-card p-5 ring-1 ring-brand/15 transition hover:ring-brand/40">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-xl font-bold text-ink">
                  <HelpTip hintKey="ownerDirectStore">
                    {t("nav.storesOwnerDirect")}
                  </HelpTip>
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {t("storesPage.ownerDirectSource")}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
              <Metric
                label={t("storesPage.staff")}
                value={t("storesPage.ownerStaff")}
              />
              <Metric
                label={t("storesPage.kinds")}
                value={String(ownerDirect.skuCount)}
              />
              <Metric
                label={t("storesPage.units")}
                value={String(ownerDirect.unitsTotal)}
              />
              <Metric
                label={t("storesPage.stockCost")}
                value={formatMoney(ownerDirect.stockCost, { short: true })}
              />
              <Metric
                label={t("storesPage.salesToday")}
                value={t("storesPage.salesTodayValue", {
                  n: ownerDirect.todaySalesCount,
                  amount: formatMoney(ownerDirect.todayRevenue, { short: true }),
                })}
              />
              <Metric
                label={t("storesPage.month")}
                value={t("storesPage.monthValue", {
                  revenue: formatMoney(ownerDirect.monthRevenue, {
                    short: true,
                  }),
                  profit: formatMoney(ownerDirect.monthProfit, { short: true }),
                })}
              />
              <Metric
                label={t("storesPage.profitToday")}
                value={formatMoney(ownerDirect.todayProfit, { short: true })}
                accent
              />
              <Metric
                label={t("storesPage.requests")}
                value={String(ownerDirect.pendingRequests)}
                warn={ownerDirect.pendingRequests > 0}
              />
              <Metric
                label={t("storesPage.lastSale")}
                value={fmtOptionalDate(ownerDirect.lastSaleAt, "common.noData")}
              />
              <Metric
                label={t("storesPage.lastRevision")}
                value={t("storesPage.revisionNotApplicable")}
              />
            </div>
          </Card>
        </Link>
      ) : null}

      {!loading ? (
        <>
          <SectionTitle>
            {showArchived
              ? t("storesPage.archiveTitle")
              : t("storesPage.branches")}{" "}
            ({branches.length})
          </SectionTitle>
          <div className="grid gap-3 lg:grid-cols-2">
            {branches.map((s) => (
              <Card key={s.id} className="h-full p-5">
                <Link href={`/stores/${s.id}`} className="block">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-ink">{s.name}</div>
                      <div className="mt-0.5 text-xs text-muted">
                        {s.address || t("storesPage.noAddress")}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        s.status === "ACTIVE" && "bg-success/10 text-success",
                        s.status === "CLOSED" && "bg-muted/30 text-muted",
                        s.status === "INVENTORY" && "bg-warning/15 text-warning",
                        s.isArchived && "bg-muted/30 text-muted"
                      )}
                    >
                      {s.isArchived
                        ? t("storeDetail.archived")
                        : labelStoreStatus(s.status, t)}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                    <Metric label={t("storesPage.staff")} value={String(s.staffCount)} />
                    <Metric label={t("storesPage.kinds")} value={String(s.skuCount)} />
                    <Metric label={t("storesPage.units")} value={String(s.unitsTotal)} />
                    <Metric
                      label={t("storesPage.stockCost")}
                      value={formatMoney(s.stockCost, { short: true })}
                    />
                    <Metric
                      label={t("storesPage.salesToday")}
                      value={formatMoney(s.todayRevenue, { short: true })}
                    />
                    <Metric
                      label={t("storesPage.month")}
                      value={formatMoney(s.monthRevenue, { short: true })}
                    />
                    <Metric
                      label={t("storesPage.profitToday")}
                      value={formatMoney(s.todayProfit, { short: true })}
                      accent
                    />
                    <Metric
                      label={t("storesPage.requests")}
                      value={String(s.pendingRequests)}
                      warn={s.pendingRequests > 0}
                    />
                    <Metric
                      label={t("storesPage.lastSale")}
                      value={fmtOptionalDate(s.lastSaleAt, "common.noData")}
                    />
                    <Metric
                      label={t("storesPage.lastRevision")}
                      value={fmtOptionalDate(s.lastRevisionAt, "storesPage.noRevision")}
                    />
                  </div>
                </Link>
                {isOwner ? (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                    {s.isArchived ? (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          fullWidth={false}
                          onClick={() => archiveStore(s.id, false)}
                        >
                          {t("storesPage.restore")}
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          fullWidth={false}
                          onClick={() => deleteStore(s.id, true)}
                        >
                          {t("storesPage.deleteForever")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        fullWidth={false}
                        onClick={() => deleteStore(s.id, false)}
                      >
                        {t("storesPage.delete")}
                      </Button>
                    )}
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
          {branches.length === 0 ? (
            <div className="py-8 text-center text-muted">
              {showArchived
                ? t("storesPage.noArchived")
                : t("storesPage.noBranches")}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function NetStat({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-bold text-ink",
          accent && "text-success",
          warn && "text-warning"
        )}
      >
        {value}
      </div>
    </Card>
  );
}

function Metric({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div>
      <div className="text-muted">{label}</div>
      <div
        className={cn(
          "font-semibold text-ink",
          accent && "text-success",
          warn && "text-warning"
        )}
      >
        {value}
      </div>
    </div>
  );
}
