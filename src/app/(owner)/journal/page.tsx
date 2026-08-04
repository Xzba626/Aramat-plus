"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { useI18n } from "@/components/i18n/i18n-provider";
import { labelRole } from "@/lib/i18n/labels";
import {
  JOURNAL_TAB_CATEGORIES,
  type ActivityLogCategory,
} from "@/lib/activity-log-categories";
import {
  JournalFilterSelect,
  type JournalSelectOption,
} from "@/components/journal/journal-filter-select";
import {
  JournalEventCard,
  type JournalLogRow,
} from "@/components/journal/journal-event-card";
import { cn } from "@/lib/utils";

type PeriodKey = "all" | "today" | "week" | "month" | "year";

type Filters = {
  category: string;
  userId: string;
  role: string;
  storeId: string;
  period: PeriodKey;
  q: string;
};

const DEFAULT_FILTERS: Filters = {
  category: "all",
  userId: "",
  role: "",
  storeId: "",
  period: "all",
  q: "",
};

type UserOpt = { id: string; name: string; role: string };
type StoreOpt = { id: string; name: string };

function categoryLabelKey(cat: ActivityLogCategory | "all"): string {
  if (cat === "all") return "journalPage.tabAll";
  if (cat === "logins") return "journalPage.catLogins";
  if (cat === "passwords") return "journalPage.catPasswords";
  if (cat === "sales") return "journalPage.catSales";
  if (cat === "returns") return "journalPage.catReturns";
  if (cat === "discounts") return "journalPage.catDiscounts";
  if (cat === "warehouse") return "journalPage.catWarehouse";
  if (cat === "products") return "journalPage.catProducts";
  if (cat === "users") return "journalPage.catUsers";
  if (cat === "settings") return "journalPage.catSettings";
  return "journalPage.catOther";
}

export default function JournalPage() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [qDraft, setQDraft] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<JournalLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [stores, setStores] = useState<StoreOpt[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [uRes, sRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/stores"),
      ]);
      const uData = await uRes.json();
      const sData = await sRes.json();
      if (!alive) return;
      if (uRes.ok && Array.isArray(uData)) {
        setUsers(
          uData.map((u: { id: string; name: string; role: string }) => ({
            id: u.id,
            name: u.name,
            role: u.role,
          }))
        );
      }
      if (sRes.ok && Array.isArray(sData)) {
        setStores(
          sData.map((s: { id: string; name: string }) => ({
            id: s.id,
            name: s.name,
          }))
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const buildParams = useCallback(
    (nextPage: number) => {
      const sp = new URLSearchParams();
      sp.set("page", String(nextPage));
      sp.set("limit", "30");
      if (filters.category !== "all") sp.set("category", filters.category);
      if (filters.userId) sp.set("userId", filters.userId);
      if (filters.role) sp.set("role", filters.role);
      if (filters.storeId) sp.set("storeId", filters.storeId);
      if (filters.period !== "all") sp.set("period", filters.period);
      if (filters.q.trim()) sp.set("q", filters.q.trim());
      return sp;
    },
    [filters]
  );

  const load = useCallback(
    async (nextPage: number, mode: "replace" | "append") => {
      if (mode === "replace") setLoading(true);
      else setLoadingMore(true);

      const res = await fetch(`/api/journal?${buildParams(nextPage).toString()}`);
      const data = await res.json();
      if (res.ok && data && Array.isArray(data.items)) {
        setItems((prev) =>
          mode === "append" ? [...prev, ...data.items] : data.items
        );
        setTotal(Number(data.total) || 0);
        setPages(Number(data.pages) || 1);
        setPage(nextPage);
      } else if (mode === "replace") {
        setItems([]);
        setTotal(0);
        setPages(1);
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [buildParams]
  );

  useEffect(() => {
    void load(1, "replace");
  }, [load]);

  useEffect(() => {
    const id = setTimeout(() => {
      setFilters((f) => {
        if (f.q === qDraft) return f;
        return { ...f, q: qDraft };
      });
    }, 300);
    return () => clearTimeout(id);
  }, [qDraft]);

  function patchFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function exportCsv() {
    const sp = buildParams(1);
    sp.delete("page");
    sp.delete("limit");
    sp.set("format", "csv");
    window.open(`/api/journal/export?${sp.toString()}`, "_blank");
  }

  const hasMore = page < pages;

  const userOptions: JournalSelectOption[] = useMemo(
    () => [
      { value: "", label: t("journalPage.allUsers") },
      ...users.map((u) => ({ value: u.id, label: u.name })),
    ],
    [t, users]
  );

  const roleOptions: JournalSelectOption[] = useMemo(
    () => [
      { value: "", label: t("journalPage.allRoles") },
      { value: "OWNER", label: labelRole("OWNER", t) },
      { value: "MANAGER", label: labelRole("MANAGER", t) },
      { value: "SELLER", label: labelRole("SELLER", t) },
    ],
    [t]
  );

  const storeOptions: JournalSelectOption[] = useMemo(
    () => [
      { value: "", label: t("journalPage.allStores") },
      ...stores.map((s) => ({ value: s.id, label: s.name })),
    ],
    [t, stores]
  );

  const periodOptions: JournalSelectOption[] = useMemo(
    () => [
      { value: "all", label: t("journalPage.periodAll") },
      { value: "today", label: t("journalPage.periodToday") },
      { value: "week", label: t("journalPage.periodWeek") },
      { value: "month", label: t("journalPage.periodMonth") },
      { value: "year", label: t("journalPage.periodYear") },
    ],
    [t]
  );

  return (
    <ModuleWorkspace
      title={t("journalPage.title")}
      subtitle={t("journalPage.subtitle")}
      kpis={[
        {
          label: t("journalPage.loaded"),
          value: loading ? "…" : String(total),
        },
        {
          label: t("journalPage.onScreen"),
          value: loading ? "…" : String(items.length),
        },
        {
          label: t("journalPage.deletion"),
          value: t("journalPage.deletionValue"),
          hint: t("journalPage.deletionHint"),
        },
      ]}
      actions={
        <Button
          type="button"
          variant="secondary"
          fullWidth={false}
          className="text-xs sm:text-sm"
          onClick={exportCsv}
          disabled={loading || total === 0}
        >
          {t("journalPage.exportCsv")}
        </Button>
      }
    >
      {/* Category tabs → real ?category= server filters */}
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {JOURNAL_TAB_CATEGORIES.map((cat) => {
          const active = filters.category === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => patchFilter("category", cat)}
              className={cn(
                "shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition sm:px-3.5 sm:text-sm",
                active
                  ? "bg-brand text-white"
                  : "bg-card text-muted ring-1 ring-border hover:text-ink"
              )}
            >
              {t(categoryLabelKey(cat))}
            </button>
          );
        })}
      </div>

      <Card className="mb-4 space-y-3 p-3 sm:p-4">
        <input
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
          placeholder={t("journalPage.search")}
          className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
        />
        <details className="group">
          <summary className="cursor-pointer list-none text-sm font-semibold text-ink marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-1">
              {t("journalPage.moreFilters")}
              <span className="text-muted group-open:hidden">▸</span>
              <span className="hidden text-muted group-open:inline">▾</span>
            </span>
          </summary>
          <div className="mt-3 flex flex-wrap gap-3">
            <JournalFilterSelect
              label={t("journalPage.filterUser")}
              value={filters.userId}
              options={userOptions}
              onChange={(v) => patchFilter("userId", v)}
            />
            <JournalFilterSelect
              label={t("journalPage.filterRole")}
              value={filters.role}
              options={roleOptions}
              onChange={(v) => patchFilter("role", v)}
            />
            <JournalFilterSelect
              label={t("journalPage.filterStore")}
              value={filters.storeId}
              options={storeOptions}
              onChange={(v) => patchFilter("storeId", v)}
            />
            <JournalFilterSelect
              label={t("journalPage.filterPeriod")}
              value={filters.period}
              options={periodOptions}
              onChange={(v) => patchFilter("period", v as PeriodKey)}
            />
          </div>
        </details>
      </Card>

      <ModuleSection title={t("journalPage.log")}>
        {loading ? (
          <Card className="p-5 text-sm text-muted">{t("common.loading")}</Card>
        ) : items.length === 0 ? (
          <EmptyState
            title={t("journalPage.emptyTitle")}
            description={t("journalPage.emptyDesc")}
          />
        ) : (
          <div className="space-y-2">
            {items.map((log) => (
              <JournalEventCard key={log.id} log={log} />
            ))}
          </div>
        )}

        {!loading && hasMore ? (
          <div className="mt-4 flex justify-center px-1">
            <Button
              type="button"
              variant="secondary"
              className="min-h-12 w-full max-w-md sm:w-auto"
              disabled={loadingMore}
              onClick={() => void load(page + 1, "append")}
            >
              {loadingMore
                ? t("common.loading")
                : t("journalPage.loadMore")}
            </Button>
          </div>
        ) : null}

        {!loading && total > 0 ? (
          <p className="mt-3 text-center text-xs text-muted">
            {t("journalPage.showingOf", {
              shown: items.length,
              total,
            })}
          </p>
        ) : null}
      </ModuleSection>
    </ModuleWorkspace>
  );
}
