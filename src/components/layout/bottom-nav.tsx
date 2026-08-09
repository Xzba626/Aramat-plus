"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Home,
  Package,
  Store,
  Wallet,
  MoreHorizontal,
  ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/i18n-provider";
import { Role } from "@prisma/client";

const OWNER_TABS: {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
}[] = [
  {
    href: "/dashboard",
    labelKey: "nav.home",
    icon: Home,
    match: (p) => p === "/dashboard" || p === "/",
  },
  {
    href: "/analytics?view=expenses",
    labelKey: "nav.finance",
    icon: Wallet,
    match: (p) => p.startsWith("/analytics"),
  },
  {
    href: "/stores",
    labelKey: "nav.stores",
    icon: Store,
    match: (p) => p.startsWith("/stores"),
  },
  {
    href: "/warehouse",
    labelKey: "nav.warehouseWorkspace",
    icon: Package,
    match: (p) =>
      p.startsWith("/warehouse") ||
      p.startsWith("/revision"),
  },
  {
    href: "/more",
    labelKey: "nav.more",
    icon: MoreHorizontal,
    match: (p) =>
      p.startsWith("/more") ||
      p.startsWith("/settings") ||
      p.startsWith("/users") ||
      p.startsWith("/notifications") ||
      p.startsWith("/journal") ||
      p.startsWith("/attention") ||
      p.startsWith("/returns") ||
      p.startsWith("/reservations"),
  },
];

/** M1 — ops-only bottom tabs for MANAGER (no finance). */
const MANAGER_TABS: typeof OWNER_TABS = [
  {
    href: "/stores",
    labelKey: "nav.stores",
    icon: Store,
    match: (p) => p.startsWith("/stores"),
  },
  {
    href: "/warehouse/transfers",
    labelKey: "nav.inventoryTransfers",
    icon: ArrowLeftRight,
    match: (p) =>
      p.startsWith("/warehouse/transfers") ||
      p.startsWith("/warehouse/return-in"),
  },
  {
    href: "/warehouse/stock",
    labelKey: "nav.storesStock",
    icon: Package,
    match: (p) => p.startsWith("/warehouse/stock"),
  },
  {
    href: "/more",
    labelKey: "nav.more",
    icon: MoreHorizontal,
    match: (p) =>
      p.startsWith("/more") ||
      p.startsWith("/settings") ||
      p.startsWith("/notifications"),
  },
];

export function OwnerBottomNav() {
  const pathname = usePathname();
  const t = useT();
  const { data: session } = useSession();
  const tabs =
    session?.user?.role === Role.MANAGER ? MANAGER_TABS : OWNER_TABS;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 px-1 pb-[calc(0.35rem+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden"
      aria-label={t("common.menu")}
    >
      <div className="mx-auto flex max-w-[640px]">
        {tabs.map((l) => {
          const active = l.match(pathname);
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-xl px-0.5 py-2 text-[11px] transition",
                active ? "font-semibold text-brand" : "text-muted"
              )}
            >
              <Icon
                className={cn("h-5 w-5", active && "text-brand")}
                strokeWidth={active ? 2.25 : 1.75}
                aria-hidden
              />
              {t(l.labelKey)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function SellerBottomNav({ cartCount = 0 }: { cartCount?: number }) {
  const pathname = usePathname();
  const t = useT();
  const links = [
    {
      href: "/pos",
      labelKey: "nav.posSell",
      icon: "⌕",
      match: (p: string) => p === "/pos",
    },
    {
      href: "/pos/history",
      labelKey: "nav.posHistory",
      icon: "☰",
      match: (p: string) => p.startsWith("/pos/history"),
    },
    {
      href: "/pos/cart",
      labelKey: "nav.posCart",
      icon: "🛒",
      match: (p: string) => p.startsWith("/pos/cart"),
      badge: cartCount,
    },
    {
      href: "/pos/notifications",
      labelKey: "nav.notifShort",
      icon: "🔔",
      match: (p: string) => p.startsWith("/pos/notifications"),
    },
    {
      href: "/pos/profile",
      labelKey: "nav.posProfile",
      icon: "👤",
      match: (p: string) => p.startsWith("/pos/profile"),
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-card px-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2">
      <div className="mx-auto flex max-w-[480px]">
        {links.map((l) => {
          const active = l.match(pathname);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "relative flex flex-1 flex-col items-center px-0.5 py-1.5 text-[11px]",
                active ? "font-semibold text-brand" : "text-muted"
              )}
            >
              <span className="mb-0.5 text-[19px] leading-none">{l.icon}</span>
              {t(l.labelKey)}
              {"badge" in l && l.badge && l.badge > 0 ? (
                <span className="absolute right-2 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                  {l.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
