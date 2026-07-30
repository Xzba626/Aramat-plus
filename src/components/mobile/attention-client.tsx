"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Package,
  Store,
  ChevronRight,
} from "lucide-react";
import { useI18n } from "@/components/i18n/i18n-provider";
import { LoadingBlock } from "@/components/ui/empty-state";
import type { DashboardPayload } from "@/lib/services/dashboard.service";
import { cn } from "@/lib/utils";

type AttentionItem = {
  id: string;
  href: string;
  label: string;
  tone: "alert" | "warning";
};

export function AttentionClient() {
  const { t } = useI18n();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo((): AttentionItem[] => {
    if (!data) return [];
    const list: AttentionItem[] = [];

    for (const d of data.decisions) {
      list.push({
        id: `dec-${d.type}-${d.id}`,
        href: "/dashboard#decisions",
        label: t("dashboard.attentionDecision", { title: t(d.titleKey) }),
        tone: "alert",
      });
    }
    for (const p of data.lowStock) {
      list.push({
        id: `stock-${p.id}`,
        href: `/warehouse/${p.productId}`,
        label: t("dashboard.attentionLowStock", { name: p.name }),
        tone: p.empty ? "alert" : "warning",
      });
    }
    for (const s of data.stores.filter((x) => x.salesCount === 0)) {
      list.push({
        id: `store-${s.id}`,
        href: `/stores/${s.id}`,
        label: t("dashboard.attentionQuietStore", { name: s.name }),
        tone: "warning",
      });
    }
    return list;
  }, [data, t]);

  if (loading) return <LoadingBlock />;

  return (
    <div className="mx-auto max-w-lg space-y-6 lg:max-w-2xl">
      <header className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-ink">
          {t("dashboard.attentionTitle")}
        </h2>
        <p className="text-sm text-muted">{t("dashboard.attentionSubtitle")}</p>
      </header>

      {items.length === 0 ? (
        <div className="flex items-start gap-3 rounded-[20px] border border-zone-money/20 bg-zone-money-soft p-5">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-zone-money-deep" />
          <p className="text-sm font-medium text-zone-money-deep">
            {t("dashboard.attentionEmpty")}
          </p>
        </div>
      ) : (
        <section className="space-y-2">
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "flex min-h-[64px] items-center gap-3 rounded-[18px] border bg-card px-4 py-3 shadow-[var(--shadow-card)]",
                item.tone === "alert"
                  ? "border-danger/25"
                  : "border-zone-alert/25"
              )}
            >
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                  item.tone === "alert"
                    ? "bg-danger/10 text-danger"
                    : "bg-zone-alert-soft text-zone-alert"
                )}
              >
                {item.href.includes("/warehouse") ? (
                  <Package className="h-5 w-5" strokeWidth={1.75} />
                ) : item.href.includes("/stores") ? (
                  <Store className="h-5 w-5" strokeWidth={1.75} />
                ) : (
                  <AlertTriangle className="h-5 w-5" strokeWidth={1.75} />
                )}
              </span>
              <span className="flex-1 text-sm font-semibold text-ink">
                {item.label}
              </span>
              <ChevronRight className="h-4 w-4 text-muted" />
            </Link>
          ))}
        </section>
      )}

      {items.length > 0 ? (
        <Link
          href={items[0].href}
          className="flex min-h-[52px] items-center justify-center rounded-[18px] bg-brand px-4 text-sm font-bold text-white shadow-[var(--shadow-card)]"
        >
          {t("dashboard.attentionFix")}
        </Link>
      ) : null}
    </div>
  );
}
