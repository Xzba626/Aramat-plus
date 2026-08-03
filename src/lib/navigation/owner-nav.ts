import { Role } from "@prisma/client";
import {
  WAREHOUSE_INTERNAL_NAV,
  isWarehouseNavActive,
  warehouseProductSegment,
} from "@/lib/navigation/warehouse-nav";

export type OwnerNavItem = {
  href: string;
  labelKey: string;
  /** If set, only these roles see the nav item */
  roles?: Role[];
};

export type OwnerNavSection = {
  id: string;
  labelKey: string;
  href: string;
  icon: string;
  /** If set, only these roles see the section */
  roles?: Role[];
  children?: OwnerNavItem[];
};

/**
 * Owner workspaces (Block 3 IA) — existing URLs, new mental model.
 * Control Center first; ERP modules grouped by job.
 */
export const OWNER_NAV_SECTIONS: OwnerNavSection[] = [
  {
    id: "home",
    labelKey: "nav.home",
    href: "/dashboard",
    icon: "home",
  },
  {
    id: "finance",
    labelKey: "nav.finance",
    href: "/analytics?view=expenses",
    icon: "finance",
    children: [
      { href: "/analytics?view=network", labelKey: "nav.financeRevenue" },
      { href: "/analytics?view=expenses", labelKey: "nav.financeExpenses" },
      { href: "/analytics?view=network&focus=net", labelKey: "nav.financeNetProfit" },
    ],
  },
  {
    id: "reports",
    labelKey: "nav.reports",
    href: "/reports",
    icon: "reports",
  },
  {
    id: "stores",
    labelKey: "nav.stores",
    href: "/stores",
    icon: "stores",
    children: [
      { href: "/stores", labelKey: "nav.storesAll" },
      { href: "/analytics?view=stores", labelKey: "nav.storesSales" },
      { href: "/warehouse/stock", labelKey: "nav.storesStock" },
      { href: "/stores#owner-direct", labelKey: "nav.storesOwnerDirect" },
    ],
  },
  {
    id: "warehouse",
    labelKey: "nav.warehouseWorkspace",
    href: "/warehouse",
    icon: "warehouse",
    children: [
      { href: "/warehouse", labelKey: "nav.inventoryOverview" },
      { href: "/warehouse/receive", labelKey: "nav.purchasesReceive" },
      { href: "/warehouse/packaging", labelKey: "nav.packaging" },
      { href: "/warehouse/purchases", labelKey: "nav.purchasesHistory" },
      { href: "/warehouse/transfers", labelKey: "nav.inventoryTransfers" },
      { href: "/warehouse/return-in", labelKey: "nav.inventoryReturnIn" },
      {
        href: "/warehouse/write-offs",
        labelKey: "nav.inventoryWriteOffs",
        roles: [Role.OWNER],
      },
      { href: "/revision", labelKey: "nav.inventoryRevision" },
      { href: "/warehouse/history", labelKey: "nav.inventoryHistory" },
      { href: "/warehouse/products", labelKey: "nav.productsCatalog" },
      { href: "/warehouse/categories", labelKey: "nav.productsCategories" },
      { href: "/warehouse/brands", labelKey: "nav.productsBrands" },
    ],
  },
  {
    id: "sales",
    labelKey: "nav.salesRequests",
    href: "/returns",
    icon: "sales",
    children: [
      { href: "/returns", labelKey: "nav.salesReturns" },
      { href: "/discounts", labelKey: "nav.salesDiscounts" },
      { href: "/reservations", labelKey: "nav.reservations" },
    ],
  },
  {
    id: "team",
    labelKey: "nav.team",
    href: "/users",
    icon: "users",
    roles: [Role.OWNER],
    children: [
      { href: "/users", labelKey: "nav.users" },
      { href: "/journal", labelKey: "nav.journal" },
    ],
  },
  {
    id: "notifications",
    labelKey: "nav.notifications",
    href: "/notifications",
    icon: "notifications",
  },
  {
    id: "settings",
    labelKey: "nav.settingsWorkspace",
    href: "/settings",
    icon: "settings",
    children: [
      { href: "/settings/company", labelKey: "nav.settingsBackup" },
      { href: "/settings/password", labelKey: "nav.settingsPassword" },
      {
        href: "/settings/wipe",
        labelKey: "nav.settingsDemo",
        roles: [Role.OWNER],
      },
    ],
  },
];

/** Filter sections/children by role */
export function filterNavForRole(role: Role): OwnerNavSection[] {
  return OWNER_NAV_SECTIONS.map((section) => {
    if (section.roles && !section.roles.includes(role)) return null;
    const children = section.children?.filter(
      (child) => !child.roles || child.roles.includes(role)
    );
    return {
      ...section,
      children: children?.length ? children : undefined,
    };
  }).filter(Boolean) as OwnerNavSection[];
}

export function isPathActive(
  pathname: string,
  href: string,
  searchParams?: URLSearchParams | null
): boolean {
  const [pathPart, query = ""] = href.split("?");
  const pathOnly = pathPart.split("#")[0];
  const hash = href.includes("#") ? href.split("#")[1]?.split("?")[0] : "";

  let pathOk = false;
  if (pathOnly === "/warehouse") {
    pathOk = pathname === "/warehouse" || pathname === "/warehouse/";
  } else if (pathOnly === "/dashboard") {
    pathOk = pathname === "/dashboard" || pathname === "/";
  } else if (pathOnly === "/stores") {
    pathOk = pathname === "/stores" || pathname === "/stores/";
  } else if (pathOnly === "/analytics") {
    pathOk = pathname === "/analytics" || pathname.startsWith("/analytics");
  } else if (pathOnly === "/settings") {
    // Exact only — avoid "Настройки → Настройки" when any /settings/* is open
    pathOk = pathname === "/settings" || pathname === "/settings/";
  } else if (pathOnly === "/returns") {
    pathOk = pathname === "/returns" || pathname.startsWith("/returns/");
  } else if (pathOnly === "/revision") {
    pathOk = pathname === "/revision" || pathname.startsWith("/revision/");
  } else if (pathOnly === "/users") {
    pathOk = pathname === "/users" || pathname.startsWith("/users/");
  } else {
    pathOk = pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
  }

  if (!pathOk) return false;

  // Analytics children: match exact ?view= (and optional ?focus=)
  if (query.includes("view=")) {
    const want = new URLSearchParams(query);
    const wantView = want.get("view");
    const wantFocus = want.get("focus");
    if (!wantView) return pathOk;
    // Without search (e.g. section parent check) — path match only for non-child use
    if (!searchParams) return false;
    if (searchParams.get("view") !== wantView) return false;
    if (wantFocus) return searchParams.get("focus") === wantFocus;
    // Href without focus must not win when URL has focus=net
    if (wantView === "network" && searchParams.get("focus") === "net") {
      return false;
    }
    return true;
  }

  if (hash && pathOnly === "/dashboard") {
    return pathOk;
  }

  return true;
}

/**
 * Prefer child whose query view matches current search when available.
 * Falls back to first path match.
 */
export function findActiveChild(
  section: OwnerNavSection,
  pathname: string,
  searchParams?: URLSearchParams | null
): OwnerNavItem | undefined {
  if (!section.children?.length) return undefined;
  const view = searchParams?.get("view");
  if (view) {
    const byView = section.children.find((c) => {
      const q = c.href.split("?")[1]?.split("#")[0] ?? "";
      return q.includes(`view=${view}`) && isPathActive(pathname, c.href, searchParams);
    });
    if (byView) return byView;
  }
  return section.children.find((c) => isPathActive(pathname, c.href, searchParams));
}

function isProductCardPath(pathname: string): boolean {
  return warehouseProductSegment(pathname) !== null;
}

export function sectionForPath(
  pathname: string,
  searchParams?: URLSearchParams | null
): OwnerNavSection | undefined {
  if (isProductCardPath(pathname) || pathname.startsWith("/warehouse/new")) {
    return OWNER_NAV_SECTIONS.find((s) => s.id === "warehouse");
  }

  // Analytics views map to workspaces
  if (pathname.startsWith("/analytics")) {
    const view = searchParams?.get("view");
    if (view === "stores") {
      return OWNER_NAV_SECTIONS.find((s) => s.id === "stores");
    }
    return OWNER_NAV_SECTIONS.find((s) => s.id === "finance");
  }

  if (pathname.startsWith("/reports")) {
    return OWNER_NAV_SECTIONS.find((s) => s.id === "reports");
  }

  if (
    pathname.startsWith("/warehouse") ||
    pathname.startsWith("/revision")
  ) {
    return OWNER_NAV_SECTIONS.find((s) => s.id === "warehouse");
  }

  if (
    pathname.startsWith("/returns") ||
    pathname.startsWith("/reservations") ||
    pathname.startsWith("/discounts")
  ) {
    return OWNER_NAV_SECTIONS.find((s) => s.id === "sales");
  }

  if (pathname.startsWith("/users") || pathname.startsWith("/journal")) {
    return OWNER_NAV_SECTIONS.find((s) => s.id === "team");
  }

  if (pathname.startsWith("/notifications")) {
    return OWNER_NAV_SECTIONS.find((s) => s.id === "notifications");
  }

  if (pathname.startsWith("/settings")) {
    return OWNER_NAV_SECTIONS.find((s) => s.id === "settings");
  }

  if (pathname.startsWith("/stores")) {
    return OWNER_NAV_SECTIONS.find((s) => s.id === "stores");
  }

  for (const section of OWNER_NAV_SECTIONS) {
    if (section.children?.some((c) => isPathActive(pathname, c.href))) {
      return section;
    }
  }
  return OWNER_NAV_SECTIONS.find((s) => isPathActive(pathname, s.href));
}

export type BreadcrumbItem = { labelKey: string; href?: string };

export function breadcrumbsForPath(pathname: string): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [{ labelKey: "nav.home", href: "/dashboard" }];

  if (isProductCardPath(pathname)) {
    crumbs.push({ labelKey: "nav.warehouseWorkspace", href: "/warehouse" });
    crumbs.push({ labelKey: "nav.productsCatalog", href: "/warehouse/products" });
    crumbs.push({ labelKey: "nav.productCard" });
    return crumbs;
  }

  if (pathname.startsWith("/warehouse/new")) {
    crumbs.push({ labelKey: "nav.warehouseWorkspace", href: "/warehouse" });
    crumbs.push({ labelKey: "nav.newProduct" });
    return crumbs;
  }

  if (pathname.startsWith("/warehouse")) {
    const section = sectionForPath(pathname);
    if (section) {
      crumbs.push({ labelKey: section.labelKey, href: section.href });
    }
    const inner = WAREHOUSE_INTERNAL_NAV.find(
      (n) => n.href !== "/warehouse" && isWarehouseNavActive(pathname, n.href)
    );
    if (inner && inner.labelKey !== section?.labelKey) {
      crumbs.push({ labelKey: inner.labelKey });
    }
    return crumbs;
  }

  if (pathname.startsWith("/stores/") && pathname !== "/stores") {
    crumbs.push({ labelKey: "nav.stores", href: "/stores" });
    if (pathname.endsWith("/pos")) {
      crumbs.push({ labelKey: "common.store" });
      crumbs.push({ labelKey: "nav.ownerSales" });
    } else {
      crumbs.push({ labelKey: "nav.storeCard" });
    }
    return crumbs;
  }

  if (pathname.startsWith("/returns")) {
    crumbs.push({ labelKey: "nav.sales", href: "/returns" });
    crumbs.push({ labelKey: "nav.salesReturns" });
    return crumbs;
  }

  if (pathname.startsWith("/revision")) {
    crumbs.push({ labelKey: "nav.warehouseWorkspace", href: "/warehouse" });
    crumbs.push({ labelKey: "nav.inventoryRevision" });
    return crumbs;
  }

  const section = sectionForPath(pathname);
  if (!section || section.id === "home") return crumbs;

  crumbs.push({
    labelKey: section.labelKey,
    href: section.href,
  });

  if (section.children) {
    const child = section.children.find((c) => isPathActive(pathname, c.href));
    if (child && child.href.split("?")[0].split("#")[0] !== section.href) {
      crumbs.push({ labelKey: child.labelKey });
    }
  }

  return crumbs;
}

export function sectionTitleKeyForPath(pathname: string): string {
  if (pathname.startsWith("/more")) return "nav.more";
  if (pathname.startsWith("/attention")) return "dashboard.attentionTitle";
  if (pathname.startsWith("/warehouse/new")) return "warehouse.productCreateTitle";
  if (isProductCardPath(pathname)) return "nav.productCard";

  const section = sectionForPath(pathname);
  if (!section) return "app.brand";

  if (section.children) {
    const child = section.children.find((c) => isPathActive(pathname, c.href));
    if (child) return child.labelKey;
  }

  return section.labelKey;
}

/** @deprecated */
export function sectionTitleForPath(pathname: string): string {
  return sectionTitleKeyForPath(pathname);
}

/** @deprecated — use WAREHOUSE_INTERNAL_NAV from warehouse-nav */
export const WAREHOUSE_SUBNAV: { href: string; label: string; icon: string }[] =
  [];
