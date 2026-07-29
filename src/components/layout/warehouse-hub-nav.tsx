"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { WAREHOUSE_SUBNAV } from "@/lib/navigation/owner-nav";

const HUB_SEGMENTS = new Set([
  "products",
  "stock",
  "categories",
  "brands",
  "batches",
  "receive",
  "transfers",
  "return-in",
  "write-offs",
  "history",
  "archive",
]);

export function WarehouseHubNav() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const second = parts[1];
  const show =
    parts[0] === "warehouse" && (!second || HUB_SEGMENTS.has(second));

  if (!show) return null;

  return (
    <div className="mb-6 -mx-1 flex gap-1 overflow-x-auto pb-1">
      {WAREHOUSE_SUBNAV.map((tab) => {
        const active =
          tab.href === "/warehouse"
            ? pathname === "/warehouse" || pathname === "/warehouse/"
            : pathname === tab.href || pathname.startsWith(tab.href + "/");
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
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
