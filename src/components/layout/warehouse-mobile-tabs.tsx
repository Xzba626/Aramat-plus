"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/i18n-provider";
import { warehouseProductSegment } from "@/lib/navigation/warehouse-nav";

/**
 * Mobile: four primary ERP entry points inside the warehouse area.
 * URLs unchanged — labels reflect module boundaries.
 */
const MOBILE_TABS = [
  { href: "/warehouse", labelKey: "nav.inventory" },
  { href: "/warehouse/products", labelKey: "nav.products" },
  { href: "/warehouse/receive", labelKey: "nav.purchases" },
  { href: "/warehouse/stock", labelKey: "nav.inventoryStock" },
] as const;

export function WarehouseMobileTabs() {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav
      className="mb-4 -mx-1 flex gap-1 overflow-x-auto pb-1 lg:hidden"
      aria-label={t("nav.subnavModules")}
    >
      {MOBILE_TABS.map((tab) => {
        const active =
          tab.href === "/warehouse"
            ? pathname === "/warehouse" ||
              pathname === "/warehouse/" ||
              pathname.startsWith("/warehouse/transfers") ||
              pathname.startsWith("/warehouse/return-in") ||
              pathname.startsWith("/warehouse/write-offs") ||
              pathname.startsWith("/warehouse/history")
            : tab.href === "/warehouse/products"
              ? pathname.startsWith("/warehouse/products") ||
                pathname.startsWith("/warehouse/categories") ||
                pathname.startsWith("/warehouse/brands") ||
                pathname.startsWith("/warehouse/new") ||
                warehouseProductSegment(pathname) !== null
              : tab.href === "/warehouse/receive"
                ? pathname.startsWith("/warehouse/receive") ||
                  pathname.startsWith("/warehouse/batches")
                : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold transition",
              active
                ? "bg-zone-stock text-white shadow-[var(--shadow-card)]"
                : "bg-card text-muted ring-1 ring-border"
            )}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
