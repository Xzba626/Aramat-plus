"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  WAREHOUSE_INTERNAL_NAV,
  isWarehouseNavActive,
} from "@/lib/navigation/warehouse-nav";
import { useT } from "@/components/i18n/i18n-provider";

const HUB_SEGMENTS = new Set([
  "products",
  "stock",
  "categories",
  "brands",
  "batches",
  "receive",
  "purchases",
  "suppliers",
  "transfers",
  "return-in",
  "write-offs",
  "history",
  "archive",
]);

/** Desktop hub chips for warehouse-area routes (i18n labels). */
export function WarehouseHubNav() {
  const pathname = usePathname();
  const t = useT();
  const parts = pathname.split("/").filter(Boolean);
  const second = parts[1];
  const show =
    parts[0] === "warehouse" && (!second || HUB_SEGMENTS.has(second));

  if (!show) return null;

  return (
    <nav
      className="mb-6 -mx-1 flex gap-1 overflow-x-auto pb-1"
      aria-label={t("nav.subnavModules")}
    >
      {WAREHOUSE_INTERNAL_NAV.map((tab) => {
        const active = isWarehouseNavActive(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition",
              active
                ? "bg-brand text-white"
                : "bg-card text-muted ring-1 ring-border hover:text-ink"
            )}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
