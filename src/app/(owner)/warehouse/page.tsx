import { auth } from "@/lib/auth";
import { Role } from "@prisma/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { formatMoney } from "@/lib/utils";
import { getWarehouseOverview } from "@/lib/services/warehouse.service";

function fmtDate(v: Date) {
  return new Date(v).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function WarehouseOverviewPage() {
  const session = await auth();
  const showFinance = session!.user.role === Role.OWNER;
  const data = await getWarehouseOverview(session!.user.companyId, showFinance);

  const kpi = [
    ...(showFinance
      ? [
          { label: "Стоимость склада (розница)", value: formatMoney(data.totalSaleValue) },
          { label: "Себестоимость остатков", value: formatMoney(data.totalCost) },
        ]
      : []),
    { label: "SKU с остатком", value: String(data.skuCount) },
    { label: "Единиц на складе", value: String(data.unitsTotal) },
    { label: "Партий с остатком", value: String(data.batchCount) },
    { label: "Товаров в каталоге", value: String(data.productCount) },
    {
      label: "Низкий остаток",
      value: String(data.lowStockCount),
      tone: "warning" as const,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Обзор склада"
        subtitle={data.warehouse?.name ?? "Центральный склад не создан — выполните seed"}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpi.map((c) => (
          <Card key={c.label} className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              {c.label}
            </div>
            <div
              className={`mt-2 text-2xl font-bold ${
                c.tone === "warning" ? "text-warning" : "text-ink"
              }`}
            >
              {c.value}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <QuickLink href="/warehouse/receive?tab=batch" label="Приход товара" />
        <QuickLink href="/warehouse/transfers/new" label="Перемещение" />
        <QuickLink href="/warehouse/return-in" label="Возврат из магазина" />
        <QuickLink href="/warehouse/products" label="Каталог" />
        <QuickLink href="/warehouse/stock" label="Остатки" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Feed
          title="Последние поступления"
          empty="Нет поступлений"
          items={data.recentReceipts.map((r) => ({
            id: r.id,
            line1: r.comment ?? "Новая партия",
            line2: `${r.userName} · ${fmtDate(r.createdAt)}`,
          }))}
        />
        <Feed
          title="Последние перемещения"
          empty="Нет перемещений"
          items={data.recentTransfers.map((t) => ({
            id: t.id,
            line1: `→ ${t.storeName} (${t.itemCount} поз.)`,
            line2: `${t.userName} · ${fmtDate(t.createdAt)}`,
          }))}
        />
        <Feed
          title="Последние возвраты"
          empty="Нет возвратов"
          items={data.recentReturns.map((r) => ({
            id: r.id,
            line1: r.comment ?? "Возврат на склад",
            line2: `${r.userName} · ${fmtDate(r.createdAt)}`,
          }))}
        />
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl bg-brand-soft px-4 py-2.5 text-sm font-semibold text-brand ring-1 ring-brand/10 hover:bg-brand hover:text-white"
    >
      {label}
    </Link>
  );
}

function Feed({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: { id: string; line1: string; line2: string }[];
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>
      <Card className="divide-y divide-border p-0">
        {items.length === 0 ? (
          <div className="p-4 text-sm text-muted">{empty}</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="px-4 py-3">
              <div className="text-sm font-semibold text-ink">{item.line1}</div>
              <div className="text-xs text-muted">{item.line2}</div>
            </div>
          ))
        )}
      </Card>
    </section>
  );
}
