/**
 * Warehouse-area internal navigation (existing URLs).
 * Grouped by ERP module for IA clarity — Products / Purchases / Inventory.
 */

export type WarehouseNavItem = {
  href: string;
  labelKey: string;
  module: "inventory" | "products" | "purchases";
};

export const WAREHOUSE_INTERNAL_NAV: WarehouseNavItem[] = [
  { href: "/warehouse", labelKey: "nav.inventoryOverview", module: "inventory" },
  { href: "/warehouse/products", labelKey: "nav.productsCatalog", module: "products" },
  { href: "/warehouse/categories", labelKey: "nav.productsCategories", module: "products" },
  { href: "/warehouse/brands", labelKey: "nav.productsBrands", module: "products" },
  { href: "/warehouse/receive", labelKey: "nav.purchasesReceive", module: "purchases" },
  { href: "/warehouse/batches", labelKey: "nav.purchasesBatches", module: "purchases" },
  { href: "/warehouse/suppliers", labelKey: "nav.purchasesSuppliers", module: "purchases" },
  { href: "/warehouse/stock", labelKey: "nav.inventoryStock", module: "inventory" },
  { href: "/warehouse/transfers", labelKey: "nav.inventoryTransfers", module: "inventory" },
  { href: "/warehouse/return-in", labelKey: "nav.inventoryReturnIn", module: "inventory" },
  { href: "/warehouse/write-offs", labelKey: "nav.inventoryWriteOffs", module: "inventory" },
  { href: "/warehouse/history", labelKey: "nav.inventoryHistory", module: "inventory" },
];

const RESERVED_SEGMENTS = new Set([
  "new",
  "products",
  "stock",
  "categories",
  "brands",
  "batches",
  "receive",
  "suppliers",
  "transfers",
  "return-in",
  "write-offs",
  "history",
  "archive",
]);

/** Product card URL: /warehouse/[cuid] (not a reserved segment). */
export function warehouseProductSegment(pathname: string): string | null {
  const match = pathname.match(/^\/warehouse\/([^/]+)$/);
  if (!match) return null;
  if (RESERVED_SEGMENTS.has(match[1])) return null;
  return match[1];
}

export function isWarehouseNavActive(pathname: string, href: string): boolean {
  if (href === "/warehouse") {
    return pathname === "/warehouse" || pathname === "/warehouse/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function warehouseSectionLabelKey(pathname: string): string {
  if (warehouseProductSegment(pathname)) return "nav.productCard";
  if (pathname.startsWith("/warehouse/new")) return "nav.newProduct";
  const item = WAREHOUSE_INTERNAL_NAV.find((n) =>
    isWarehouseNavActive(pathname, n.href)
  );
  return item?.labelKey ?? "nav.inventory";
}
