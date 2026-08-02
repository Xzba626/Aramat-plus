"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel, SectionTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

type RefItem = { id: string; name: string; symbol?: string; code?: string };

async function fetchList(path: string) {
  const res = await fetch(path);
  const data = await res.json();
  return Array.isArray(data) ? (data as RefItem[]) : [];
}

function RefSection({
  title,
  path,
  extraFields,
  t,
}: {
  title: string;
  path: string;
  extraFields?: "symbol" | "code";
  t: (key: string) => string;
}) {
  const [items, setItems] = useState<RefItem[]>([]);
  const [error, setError] = useState("");

  async function load() {
    setItems(await fetchList(path));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    const body: Record<string, string> = { name: String(fd.get("name")) };
    if (extraFields === "symbol") body.symbol = String(fd.get("symbol"));
    if (extraFields === "code") body.code = String(fd.get("code"));

    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    (e.target as HTMLFormElement).reset();
    load();
  }

  return (
    <div className="mb-6">
      <SectionTitle>{title}</SectionTitle>
      <Card>
        {items.length === 0 ? (
          <div className="py-3 text-center text-text-dim">{t("common.noData")}</div>
        ) : (
          items.map((i) => (
            <div key={i.id} className="border-b border-line py-2 last:border-0">
              {i.name}
              {i.symbol ? ` (${i.symbol})` : ""}
              {i.code ? ` [${i.code}]` : ""}
            </div>
          ))
        )}
      </Card>
      <form onSubmit={onSubmit} className="mt-2 space-y-2">
        <div>
          <FieldLabel>{t("settingsSub.name")}</FieldLabel>
          <input name="name" required />
        </div>
        {extraFields === "symbol" ? (
          <div>
            <FieldLabel>{t("settingsSub.symbol")}</FieldLabel>
            <input name="symbol" required placeholder={t("settingsSub.symbolPlaceholder")} />
          </div>
        ) : null}
        {extraFields === "code" ? (
          <div>
            <FieldLabel>{t("settingsSub.code")}</FieldLabel>
            <input name="code" required placeholder={t("settingsSub.codePlaceholder")} />
          </div>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" variant="secondary">
          {t("settingsSub.add")}
        </Button>
      </form>
    </div>
  );
}

export default function ReferencesPage() {
  const { t } = useI18n();

  return (
    <>
      <PageHeader title={t("settingsSub.references")} subtitle={t("settingsSub.references")} />
      <div className="max-w-3xl">
        <RefSection title={t("wh.categoriesTitle")} path="/api/categories" t={t} />
        <RefSection title={t("wh.brandsTitle")} path="/api/brands" t={t} />
        <RefSection title={t("wh.stockTitle")} path="/api/units" extraFields="symbol" t={t} />
        <Card className="mb-6 p-4 text-sm text-muted">
          {t("wh.referencesProductTypesNote")}{" "}
          <Link href="/warehouse/product-types" className="font-semibold text-brand">
            {t("nav.productsTypes")} →
          </Link>
        </Card>
        <RefSection title={t("wh.historyTitle")} path="/api/operation-types" extraFields="code" t={t} />
        <RefSection title={t("storeDetail.expenses")} path="/api/expense-types" t={t} />
      </div>
    </>
  );
}
