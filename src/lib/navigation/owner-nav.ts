import { Role } from "@prisma/client";
import {
  WAREHOUSE_INTERNAL_NAV,
  isWarehouseNavActive,
} from "@/lib/navigation/warehouse-nav";

export type OwnerNavItem = {
  href: string;
  labelKey: string;
};

export type OwnerNavSection = {
  id: string;
  labelKey: string;
  href: string;
  icon: string;
  /** If set, only these roles see the item */
  roles?: Role[];
  children?: OwnerNavItem[];
};

/**
 * Grouped Owner Desktop navigation — progressive disclosure, not a flat list.
 * Labels via i18n labelKey (t(labelKey)).
 */
export const OWNER_NAV_SECTIONS: OwnerNavSection[] = [
  {
    id: "home",
    labelKey: "nav.home",
    href: "/dashboard",
    icon: "home",
  },
  {
    id: "warehouse",
    labelKey: "nav.warehouse",
    href: "/warehouse",
    icon: "warehouse",
    children: [
      { href: "/warehouse", labelKey: "nav.warehouseOverview" },
      { href: "/warehouse/products", labelKey: "nav.warehouseCatalog" },
      { href: "/warehouse/stock", labelKey: "nav.warehouseStock" },
      { href: "/warehouse/receive", labelKey: "nav.warehouseReceive" },
      { href: "/warehouse/transfers", labelKey: "nav.warehouseTransfers" },
      { href: "/returns", labelKey: "nav.warehouseReturns" },
      { href: "/warehouse/return-in", labelKey: "nav.warehouseReturnIn" },
      { href: "/warehouse/write-offs", labelKey: "nav.warehouseWriteOffs" },
      { href: "/revision", labelKey: "nav.warehouseRevision" },
      { href: "/warehouse/history", labelKey: "nav.warehouseHistory" },
      { href: "/warehouse/batches", labelKey: "nav.warehouseBatches" },
      { href: "/warehouse/categories", labelKey: "nav.warehouseCategories" },
      { href: "/warehouse/brands", labelKey: "nav.warehouseBrands" },
    ],
  },
  {
    id: "stores",
    labelKey: "nav.stores",
    href: "/stores",
    icon: "stores",
    children: [
      { href: "/stores", labelKey: "nav.storesAll" },
      { href: "/stores#owner-direct", labelKey: "nav.storesOwnerDirect" },
    ],
  },
  {
    id: "analytics",
    labelKey: "nav.analytics",
    href: "/analytics",
    icon: "analytics",
    children: [
      { href: "/analytics?view=network", labelKey: "nav.analyticsNetwork" },
      { href: "/analytics?view=stores", labelKey: "nav.analyticsStores" },
      { href: "/analytics?view=products", labelKey: "nav.analyticsProducts" },
      { href: "/analytics?view=sellers", labelKey: "nav.analyticsSellers" },
      { href: "/analytics?view=expenses", labelKey: "nav.analyticsFinance" },
    ],
  },
  {
    id: "system",
    labelKey: "nav.system",
    href: "/settings",
    icon: "settings",
    children: [
      { href: "/users", labelKey: "nav.users" },
      { href: "/notifications", labelKey: "nav.notifications" },
      { href: "/journal", labelKey: "nav.journal" },
      { href: "/settings", labelKey: "nav.settings" },
    ],
  },
];

/** Filter users item for non-owners inside system children */
export function filterNavForRole(role: Role): OwnerNavSection[] {
  return OWNER_NAV_SECTIONS.map((section) => {
    if (section.id === "system" && section.children) {
      return {
        ...section,
        children: section.children.filter(
          (c) => !(c.href === "/users" && role !== Role.OWNER)
        ),
      };
    }
    if (section.roles && !section.roles.includes(role)) return null;
    return section;
  }).filter(Boolean) as OwnerNavSection[];
}

export function isPathActive(pathname: string, href: string): boolean {
  const pathOnly = href.split("?")[0].split("#")[0];
  if (pathOnly === "/warehouse") {
    return pathname === "/warehouse" || pathname === "/warehouse/";
  }
  if (pathOnly === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/";
  }
  if (pathOnly === "/stores") {
    return pathname === "/stores" || pathname === "/stores/";
  }
  if (pathOnly === "/analytics") {
    return pathname === "/analytics" || pathname.startsWith("/analytics");
  }
  if (pathOnly === "/settings") {
    return pathname === "/settings" || pathname.startsWith("/settings/");
  }
  return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
}

export function sectionForPath(pathname: string): OwnerNavSection | undefined {
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

  if (pathname.startsWith("/warehouse")) {
    crumbs.push({ labelKey: "nav.warehouseFull", href: "/warehouse" });
    const productMatch = pathname.match(/^\/warehouse\/([^/]+)$/);
    if (
      productMatch &&
      ![
        "new",
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
      ].includes(productMatch[1])
    ) {
      crumbs.push({ labelKey: "nav.warehouseCatalog", href: "/warehouse/products" });
      crumbs.push({ labelKey: "nav.productCard" });
      return crumbs;
    }
    if (pathname.startsWith("/warehouse/new")) {
      crumbs.push({ labelKey: "nav.warehouseCatalog", href: "/warehouse/products" });
      crumbs.push({ labelKey: "nav.newProduct" });
      return crumbs;
    }
    const inner = WAREHOUSE_INTERNAL_NAV.find(
      (n) => n.href !== "/warehouse" && isWarehouseNavActive(pathname, n.href)
    );
    if (inner) crumbs.push({ labelKey: inner.labelKey });
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

  const section = sectionForPath(pathname);
  if (!section || section.id === "home") return crumbs;

  crumbs.push({
    labelKey: section.labelKey,
    href: section.href,
  });

  if (section.children) {
    const child = section.children.find((c) => isPathActive(pathname, c.href));
    if (child && child.href.split("?")[0] !== section.href) {
      crumbs.push({ labelKey: child.labelKey });
    }
  }

  return crumbs;
}

export function sectionTitleKeyForPath(pathname: string): string {
  if (pathname.startsWith("/more")) return "nav.more";
  if (pathname.startsWith("/attention")) return "dashboard.attentionTitle";

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

/** @deprecated */
export const WAREHOUSE_SUBNAV: { href: string; label: string; icon: string }[] =
  [];
