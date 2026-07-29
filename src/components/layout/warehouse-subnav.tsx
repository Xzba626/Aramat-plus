"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  WAREHOUSE_INTERNAL_NAV,
  isWarehouseNavActive,
} from "@/lib/navigation/warehouse-nav";

export function WarehouseSubnav() {
  const pathname = usePathname();

  return (
    <nav
      className="mb-6 -mx-1 flex gap-1 overflow-x-auto border-b border-border pb-3"
      aria-label="Навигация склада"
    >
      {WAREHOUSE_INTERNAL_NAV.map((item) => {
        const active = isWarehouseNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition",
              active
                ? "bg-brand text-white"
                : "bg-card text-muted ring-1 ring-border hover:text-ink"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
