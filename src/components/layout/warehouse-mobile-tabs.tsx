"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/i18n-provider";

/** Mobile-only: 4 primary warehouse tasks — not the full desktop tree. */
const MOBILE_TABS = [
  { href: "/warehouse", labelKey: "nav.warehouseOverview", exact: true },
  { href: "/warehouse/products", labelKey: "nav.warehouseCatalog" },
  { href: "/warehouse/receive", labelKey: "nav.warehouseReceive" },
  { href: "/warehouse/history", labelKey: "nav.warehouseHistory" },
] as const;

export function WarehouseMobileTabs() {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav
      className="mb-4 -mx-1 flex gap-1 overflow-x-auto pb-1 lg:hidden"
      aria-label={t("nav.subnavWarehouse")}
    >
      {MOBILE_TABS.map((tab) => {
        const active = tab.exact
          ? pathname === "/warehouse" || pathname === "/warehouse/"
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
