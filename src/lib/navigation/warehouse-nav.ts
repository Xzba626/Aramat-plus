/** TASK 02 — internal warehouse navigation (not in main sidebar) */

export type WarehouseNavItem = {
  href: string;
  label: string;
};

export const WAREHOUSE_INTERNAL_NAV: WarehouseNavItem[] = [
  { href: "/warehouse", label: "Обзор" },
  { href: "/warehouse/stock", label: "Остатки" },
  { href: "/warehouse/products", label: "Каталог" },
  { href: "/warehouse/categories", label: "Категории" },
  { href: "/warehouse/brands", label: "Бренды" },
  { href: "/warehouse/batches", label: "Партии" },
  { href: "/warehouse/receive", label: "Поступление" },
  { href: "/warehouse/transfers", label: "Отправка" },
  { href: "/warehouse/return-in", label: "Возврат на склад" },
  { href: "/warehouse/write-offs", label: "Списание" },
  { href: "/warehouse/history", label: "История" },
];

export function isWarehouseNavActive(pathname: string, href: string): boolean {
  if (href === "/warehouse") {
    return pathname === "/warehouse" || pathname === "/warehouse/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function warehouseSectionLabel(pathname: string): string {
  const item = WAREHOUSE_INTERNAL_NAV.find((n) => isWarehouseNavActive(pathname, n.href));
  return item?.label ?? "Склад";
}
