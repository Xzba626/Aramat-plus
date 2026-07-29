/** TASK 02 — internal warehouse navigation (not in main sidebar) */

export type WarehouseNavItem = {
  href: string;
  labelKey: string;
};

export const WAREHOUSE_INTERNAL_NAV: WarehouseNavItem[] = [
  { href: "/warehouse", labelKey: "nav.warehouseOverview" },
  { href: "/warehouse/stock", labelKey: "nav.warehouseStock" },
  { href: "/warehouse/products", labelKey: "nav.warehouseCatalog" },
  { href: "/warehouse/categories", labelKey: "nav.warehouseCategories" },
  { href: "/warehouse/brands", labelKey: "nav.warehouseBrands" },
  { href: "/warehouse/batches", labelKey: "nav.warehouseBatches" },
  { href: "/warehouse/receive", labelKey: "nav.warehouseReceive" },
  { href: "/warehouse/transfers", labelKey: "nav.warehouseTransfers" },
  { href: "/warehouse/return-in", labelKey: "nav.warehouseReturnIn" },
  { href: "/warehouse/write-offs", labelKey: "nav.warehouseWriteOffs" },
  { href: "/warehouse/history", labelKey: "nav.warehouseHistory" },
];

export function isWarehouseNavActive(pathname: string, href: string): boolean {
  if (href === "/warehouse") {
    return pathname === "/warehouse" || pathname === "/warehouse/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function warehouseSectionLabelKey(pathname: string): string {
  const item = WAREHOUSE_INTERNAL_NAV.find((n) =>
    isWarehouseNavActive(pathname, n.href)
  );
  return item?.labelKey ?? "nav.warehouse";
}
