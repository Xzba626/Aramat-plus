"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel, SectionTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";
import { labelStoreStatus, apiErrorMessage } from "@/lib/i18n/labels";

type StoreCard = {
  id: string;
  name: string;
  address?: string | null;
  kind: "BRANCH" | "OWNER_DIRECT";
  status: string;
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

export default function StoresPage() {
  const { t, formatMoney, formatDateTime } = useI18n();
  const [stores, setStores] = useState<StoreCard[]>([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const res = await fetch("/api/stores");
    const data = await res.json();
    if (res.ok) setStores(data);
    else setError(apiErrorMessage(data.error, t, "storesPage.error"));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ownerDirect = useMemo(
    () => stores.find((s) => s.kind === "OWNER_DIRECT"),
    [stores]
  );
  const branches = useMemo(
    () => stores.filter((s) => s.kind !== "OWNER_DIRECT"),
    [stores]
  );

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
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "storesPage.error"));
      return;
    }
    setShowForm(false);
    load();
  }

  function fmtOptionalDate(v: string | null, emptyKey: string) {
    if (!v) return t(emptyKey);
    return formatDateTime(v);
  }

  return (
    <div>
      <PageHeader
        title={t("storesPage.title")}
        count={stores.length || null}
        subtitle={t("storesPage.subtitle")}
        actions={
          <Button
            type="button"
            fullWidth={false}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? t("common.cancel") : t("storesPage.addBranch")}
          </Button>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NetStat label={t("storesPage.branches")} value={String(network.branchCount)} />
        <NetStat
          label={t("storesPage.salesToday")}
          value={formatMoney(network.todayRevenue, { short: true })}
        />
        <NetStat
          label={t("storesPage.profitToday")}
          value={formatMoney(network.todayProfit, { short: true })}
          accent
        />
        <NetStat
          label={t("storesPage.pendingDecisions")}
          value={String(network.pending)}
          warn={network.pending > 0}
        />
      </div>

      {showForm ? (
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
            <Button type="submit">{t("common.save")}</Button>
          </form>
        </Card>
      ) : null}

      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}

      {ownerDirect ? (
        <Link
          href={`/stores/${ownerDirect.id}`}
          id="owner-direct"
          className="mb-6 block scroll-mt-24"
        >
          <Card className="border-brand/30 bg-gradient-to-br from-brand-soft to-card p-5 ring-1 ring-brand/15 transition hover:ring-brand/40">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xl font-bold text-ink">
                  {t("nav.storesOwnerDirect")}
                </div>
                <div className="mt-2 text-sm text-muted">
                  {t("storesPage.ownerDirectHint")}
                  <br />
                  {t("storesPage.kindsOnHand", {
                    sku: ownerDirect.skuCount,
                    units: ownerDirect.unitsTotal,
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-right text-sm">
                <div>
                  <div className="text-xs text-muted">{t("storesPage.today")}</div>
                  <div className="font-bold">
                    {t("storesPage.salesShort", {
                      n: ownerDirect.todaySalesCount,
                    })}
                  </div>
                  <div className="text-success">
                    {formatMoney(ownerDirect.todayRevenue, { short: true })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted">{t("storesPage.month")}</div>
                  <div className="font-bold text-ink">
                    {formatMoney(ownerDirect.monthRevenue, { short: true })}
                  </div>
                  <div className="text-success">
                    {formatMoney(ownerDirect.monthProfit, { short: true })}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </Link>
      ) : null}

      <SectionTitle>
        {t("storesPage.branches")} ({branches.length})
      </SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        {branches.map((s) => (
          <Link key={s.id} href={`/stores/${s.id}`}>
            <Card tap className="h-full p-5">
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
                    s.status === "INVENTORY" && "bg-warning/15 text-warning"
                  )}
                >
                  {labelStoreStatus(s.status, t)}
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
            </Card>
          </Link>
        ))}
      </div>
      {branches.length === 0 ? (
        <div className="py-8 text-center text-muted">{t("storesPage.noBranches")}</div>
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
