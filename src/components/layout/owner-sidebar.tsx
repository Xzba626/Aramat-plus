"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Bell,
  Boxes,
  Home,
  Package,
  PackagePlus,
  Settings,
  ShoppingBag,
  Store,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Role } from "@prisma/client";
import { cn } from "@/lib/utils";
import {
  filterNavForRole,
  isPathActive,
  type OwnerNavItem,
  type OwnerNavSection,
} from "@/lib/navigation/owner-nav";
import { useT } from "@/components/i18n/i18n-provider";
import { BrandMark } from "@/components/company/brand-mark";
import { useCompanyBrand } from "@/components/company/company-brand-provider";

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  finance: Wallet,
  reports: BarChart3,
  stores: Store,
  warehouse: Boxes,
  sales: ShoppingBag,
  users: Users,
  notifications: Bell,
  settings: Settings,
  // legacy aliases
  products: Package,
  purchases: PackagePlus,
  inventory: Boxes,
  analytics: BarChart3,
};

function NavIcon({ name }: { name: string }) {
  const Icon = ICONS[name] ?? Package;
  return <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden />;
}

function SubNavLink({
  item,
  pathname,
  searchParams,
  onNavigate,
}: {
  item: OwnerNavItem;
  pathname: string;
  searchParams?: URLSearchParams | null;
  onNavigate?: () => void;
}) {
  const t = useT();
  const active = isPathActive(pathname, item.href, searchParams);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center rounded-lg py-1.5 pl-10 pr-3 text-[13px] transition",
        active
          ? "bg-white/10 font-semibold text-white"
          : "text-sidebar-text/85 hover:bg-sidebar-hover hover:text-white"
      )}
    >
      {t(item.labelKey)}
    </Link>
  );
}

function SectionLink({
  section,
  pathname,
  searchParams,
  expanded,
  onToggle,
  onNavigate,
}: {
  section: OwnerNavSection;
  pathname: string;
  searchParams?: URLSearchParams | null;
  expanded: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const t = useT();
  const hasChildren = Boolean(section.children?.length);
  const childActive = section.children?.some((c) =>
    isPathActive(pathname, c.href, searchParams)
  );
  const active =
    isPathActive(pathname, section.href, searchParams) || Boolean(childActive);

  if (!hasChildren) {
    return (
      <Link
        href={section.href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
          active
            ? "bg-brand/25 font-semibold text-white"
            : "text-sidebar-text hover:bg-sidebar-hover hover:text-white"
        )}
      >
        <NavIcon name={section.icon} />
        <span className="flex-1">{t(section.labelKey)}</span>
      </Link>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-0.5">
        <Link
          href={section.href}
          onClick={onNavigate}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
            active
              ? "bg-white/8 font-semibold text-white"
              : "text-sidebar-text hover:bg-sidebar-hover hover:text-white"
          )}
        >
          <NavIcon name={section.icon} />
          <span className="flex-1 truncate text-left">{t(section.labelKey)}</span>
        </Link>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg px-2.5 py-2.5 text-xs text-white/45 hover:bg-sidebar-hover hover:text-white"
          aria-label={expanded ? t("common.collapse") : t("common.expand")}
          aria-expanded={expanded}
        >
          {expanded ? "▾" : "▸"}
        </button>
      </div>
      {expanded ? (
        <div className="mt-0.5 space-y-0.5 pb-1">
          {section.children!.map((item) => (
            <SubNavLink
              key={item.href + item.labelKey}
              item={item}
              pathname={pathname}
              searchParams={searchParams}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OwnerSidebar({
  role,
  open,
  onClose,
  onNavigate,
}: {
  role: string;
  open?: boolean;
  onClose?: () => void;
  /** Called when a nav link is clicked (mobile: closes drawer). */
  onNavigate?: () => void;
}) {
  const t = useT();
  const { companyName } = useCompanyBrand();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sections = filterNavForRole(role as Role);
  const activeSectionId =
    sections.find(
      (s) =>
        isPathActive(pathname, s.href, searchParams) ||
        s.children?.some((c) => isPathActive(pathname, c.href, searchParams))
    )?.id ?? null;
  const [expandedId, setExpandedId] = useState<string | null>(activeSectionId);

  useEffect(() => {
    if (activeSectionId) setExpandedId(activeSectionId);
  }, [activeSectionId]);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-sidebar text-sidebar-text transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        data-drawer-open={open ? "1" : "0"}
      >
        <div className="border-b border-white/8 px-4 py-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-3"
            onClick={onNavigate}
            title={companyName}
          >
            <Image
              src="/logo-aramat-plus.png"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg object-contain"
              priority
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold leading-tight text-white">
                <BrandMark accentClassName="text-brand" />
              </div>
              <div className="truncate text-[10px] tracking-wide text-white/40">
                {t("app.tagline")}
              </div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3">
          <ul className="space-y-1">
            {sections.map((section) => (
              <li key={section.id}>
                <SectionLink
                  section={section}
                  pathname={pathname}
                  searchParams={searchParams}
                  expanded={expandedId === section.id}
                  onToggle={() =>
                    setExpandedId((cur) => (cur === section.id ? null : section.id))
                  }
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
}

export { WAREHOUSE_SUBNAV } from "@/lib/navigation/owner-nav";
