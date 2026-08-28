import { PrismaClient, StoreKind } from "@prisma/client";
import { decimalToNumber } from "../../../src/lib/utils";
import {
  saleGrossMetrics,
  saleGrossMetricsNetOfReturnsSync,
  detectSaleFinancialIssues,
} from "../../../src/lib/services/profit.service";
import { getAnalyticsBreakdown } from "../../../src/lib/services/analytics.service";
import { getDashboardPayload } from "../../../src/lib/services/dashboard.service";
import { loadApprovedReturnLines } from "../../../src/lib/services/profit.service";
import {
  computeRawFinancials,
} from "./independent-calculator";

const prisma = new PrismaClient();

export type ForensicSnapshot = {
  label: string;
  timestamp: string;
  counts: {
    products: number;
    batches: number;
    sales: number;
    saleItems: number;
    returns: number;
    activityLogs: number;
  };
  financials: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    analyticsRevenue: number;
    analyticsCogs: number;
    analyticsGross: number;
    dashboardTodayRevenue?: number;
    dashboardTodayGross?: number;
    /** Independent raw-DB calculator (not profit.service) */
    rawRevenue?: number;
    rawCogs?: number;
    rawGross?: number;
  };
  ownerDirect?: {
    sales: number;
    revenue: number;
    cogs: number;
    grossProfit: number;
  };
  sales: Array<{
    id: string;
    total: number;
    subtotal: number;
    discount: number;
    status: string;
    itemRows: number;
    lineCogs: number;
    issues: string[];
    items: Array<{
      id: string;
      productId: string;
      productName: string;
      sku: string | null;
      batchId: string | null;
      qty: number;
      salePrice: number;
      costPerUnit: number;
      lineCogs: number;
    }>;
  }>;
  invariantOk: boolean;
  invariantErrors: string[];
};

function money(n: number) {
  return Math.round(n * 100) / 100;
}

export async function takeForensicSnapshot(params: {
  companyId: string;
  label: string;
  ownerDirectStoreId?: string;
  expected?: { revenue?: number; cogs?: number; grossProfit?: number };
}): Promise<ForensicSnapshot> {
  const sales = await prisma.sale.findMany({
    where: {
      store: { companyId: params.companyId },
      status: { in: ["COMPLETED", "PARTIAL_RETURN"] },
    },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const retLines = await loadApprovedReturnLines(sales.map((s) => s.id));
  const gross = saleGrossMetricsNetOfReturnsSync(sales, retLines);

  const ownerStore =
    params.ownerDirectStoreId ??
    (
      await prisma.store.findFirst({
        where: { companyId: params.companyId, kind: StoreKind.OWNER_DIRECT },
      })
    )?.id;

  let ownerDirect: ForensicSnapshot["ownerDirect"];
  if (ownerStore) {
    const odSales = sales.filter((s) => s.storeId === ownerStore);
    const odGross = saleGrossMetricsNetOfReturnsSync(odSales, retLines);
    ownerDirect = {
      sales: odGross.count,
      revenue: money(odGross.revenue),
      cogs: money(odGross.cogs),
      grossProfit: money(odGross.grossProfit),
    };
  }

  const analytics = await getAnalyticsBreakdown(params.companyId, "year", {
    storeId: ownerStore ?? null,
  });

  let dashboardTodayRevenue: number | undefined;
  let dashboardTodayGross: number | undefined;
  try {
    const dash = await getDashboardPayload(params.companyId);
    dashboardTodayRevenue = money(dash.today.revenue);
    dashboardTodayGross = money(dash.today.grossProfit);
  } catch {
    /* dashboard may need more context */
  }

  const saleRows = sales.map((s) => {
    const lineCogs = s.items.reduce(
      (sum, it) =>
        sum + decimalToNumber(it.costPerUnit) * decimalToNumber(it.quantity),
      0
    );
    const issues = detectSaleFinancialIssues(s);
    return {
      id: s.id,
      total: money(decimalToNumber(s.total)),
      subtotal: money(decimalToNumber(s.subtotal)),
      discount: money(decimalToNumber(s.discountAmount)),
      status: s.status,
      itemRows: s.items.length,
      lineCogs: money(lineCogs),
      issues,
      items: s.items.map((it) => ({
        id: it.id,
        productId: it.productId,
        productName: it.product.name,
        sku: it.product.sku,
        batchId: it.batchId,
        qty: decimalToNumber(it.quantity),
        salePrice: decimalToNumber(it.salePrice),
        costPerUnit: decimalToNumber(it.costPerUnit),
        lineCogs: money(
          decimalToNumber(it.costPerUnit) * decimalToNumber(it.quantity)
        ),
      })),
    };
  });

  const invariantErrors: string[] = [];
  if (params.expected?.revenue != null) {
    if (Math.abs(gross.revenue - params.expected.revenue) > 0.05) {
      invariantErrors.push(
        `revenue expected ${params.expected.revenue} got ${gross.revenue}`
      );
    }
  }
  if (params.expected?.cogs != null) {
    if (Math.abs(gross.cogs - params.expected.cogs) > 0.05) {
      invariantErrors.push(
        `cogs expected ${params.expected.cogs} got ${gross.cogs}`
      );
    }
  }
  if (params.expected?.grossProfit != null) {
    if (Math.abs(gross.grossProfit - params.expected.grossProfit) > 0.05) {
      invariantErrors.push(
        `gross expected ${params.expected.grossProfit} got ${gross.grossProfit}`
      );
    }
  }

  if (ownerDirect && ownerStore) {
    if (
      Math.abs(analytics.network.revenue - ownerDirect.revenue) > 0.05 &&
      odSalesCount(sales, ownerStore) > 0
    ) {
      invariantErrors.push(
        `analytics vs ownerDirect revenue ${analytics.network.revenue} vs ${ownerDirect.revenue}`
      );
    }
  }

  const rawFin = await computeRawFinancials({
    companyId: params.companyId,
  });
  if (sales.length > 0) {
    if (Math.abs(rawFin.revenue - gross.revenue) > 0.05) {
      invariantErrors.push(
        `raw-DB vs app revenue ${rawFin.revenue} vs ${gross.revenue}`
      );
    }
    if (Math.abs(rawFin.cogs - gross.cogs) > 0.05) {
      invariantErrors.push(
        `raw-DB vs app cogs ${rawFin.cogs} vs ${gross.cogs}`
      );
    }
  }

  if (ownerDirect && ownerStore && odSalesCount(sales, ownerStore) > 0) {
    const rawOd = await computeRawFinancials({
      companyId: params.companyId,
      storeId: ownerStore,
    });
    if (Math.abs(rawOd.revenue - ownerDirect.revenue) > 0.05) {
      invariantErrors.push(
        `raw-DB vs ownerDirect revenue ${rawOd.revenue} vs ${ownerDirect.revenue}`
      );
    }
    if (Math.abs(rawOd.cogs - ownerDirect.cogs) > 0.05) {
      invariantErrors.push(
        `raw-DB vs ownerDirect cogs ${rawOd.cogs} vs ${ownerDirect.cogs}`
      );
    }
  }

  for (const s of saleRows) {
    if (s.issues.includes("PHANTOM_COGS_MATCHES_SALE_TOTAL")) {
      invariantErrors.push(`phantom COGS on sale ${s.id}`);
    }
    if (Math.abs(s.lineCogs - s.total) < 0.02 && s.itemRows === 1 && s.total > 50) {
      const it = s.items[0];
      if (it && Math.abs(it.costPerUnit - it.salePrice) < 0.01) {
        invariantErrors.push(`costPerUnit≈salePrice on sale ${s.id}`);
      }
    }
  }

  const snap: ForensicSnapshot = {
    label: params.label,
    timestamp: new Date().toISOString(),
    counts: {
      products: await prisma.product.count({
        where: { companyId: params.companyId },
      }),
      batches: await prisma.batch.count({
        where: { product: { companyId: params.companyId } },
      }),
      sales: sales.length,
      saleItems: await prisma.saleItem.count({
        where: { sale: { store: { companyId: params.companyId } } },
      }),
      returns: await prisma.saleReturn.count({
        where: { sale: { store: { companyId: params.companyId } } },
      }),
      activityLogs: await prisma.activityLog.count({
        where: { companyId: params.companyId },
      }),
    },
    financials: {
      revenue: money(gross.revenue),
      cogs: money(gross.cogs),
      grossProfit: money(gross.grossProfit),
      analyticsRevenue: money(analytics.network.revenue),
      analyticsCogs: money(analytics.network.cogs),
      analyticsGross: money(analytics.network.grossProfit),
      dashboardTodayRevenue,
      dashboardTodayGross,
      rawRevenue: money(rawFin.revenue),
      rawCogs: money(rawFin.cogs),
      rawGross: money(rawFin.grossProfit),
    },
    ownerDirect,
    sales: saleRows,
    invariantOk: invariantErrors.length === 0,
    invariantErrors,
  };

  printSnapshot(snap, params.expected);
  return snap;
}

function odSalesCount(
  sales: Array<{ storeId: string }>,
  ownerStoreId: string
) {
  return sales.filter((s) => s.storeId === ownerStoreId).length;
}

export function printSnapshot(
  snap: ForensicSnapshot,
  expected?: { revenue?: number; cogs?: number; grossProfit?: number }
) {
  console.log(`\n=== FORENSIC SNAPSHOT: ${snap.label} ===`);
  console.log(`time: ${snap.timestamp}`);
  console.log(
    `counts: products=${snap.counts.products} batches=${snap.counts.batches} sales=${snap.counts.sales} saleItems=${snap.counts.saleItems} returns=${snap.counts.returns}`
  );
  console.log(
    `financials: revenue=${snap.financials.revenue} cogs=${snap.financials.cogs} gross=${snap.financials.grossProfit}`
  );
  if (snap.ownerDirect) {
    console.log(
      `ownerDirect: sales=${snap.ownerDirect.sales} rev=${snap.ownerDirect.revenue} cogs=${snap.ownerDirect.cogs} gross=${snap.ownerDirect.grossProfit}`
    );
  }
  console.log(
    `analytics: rev=${snap.financials.analyticsRevenue} cogs=${snap.financials.analyticsCogs} gross=${snap.financials.analyticsGross}`
  );
  if (snap.financials.rawRevenue != null) {
    console.log(
      `raw-DB: rev=${snap.financials.rawRevenue} cogs=${snap.financials.rawCogs} gross=${snap.financials.rawGross}`
    );
  }
  if (expected) {
    console.log(
      `expected: rev=${expected.revenue ?? "—"} cogs=${expected.cogs ?? "—"} gross=${expected.grossProfit ?? "—"}`
    );
    const diff =
      expected.cogs != null
        ? money(snap.financials.cogs - expected.cogs)
        : undefined;
    if (diff != null) console.log(`COGS difference: ${diff}`);
  }
  if (!snap.invariantOk) {
    console.log("INVARIANT ERRORS:", snap.invariantErrors.join("; "));
  } else {
    console.log("invariants: OK");
  }
  for (const s of snap.sales.slice(-3)) {
    console.log(
      `  sale ${s.id.slice(-8)} total=${s.total} items=${s.itemRows} lineCogs=${s.lineCogs} issues=${s.issues.join(",") || "none"}`
    );
  }
}

export async function disconnectSnapshot() {
  await prisma.$disconnect();
}
