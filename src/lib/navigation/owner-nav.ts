import { Role } from "@prisma/client";
import {
  WAREHOUSE_INTERNAL_NAV,
  isWarehouseNavActive,
  warehouseProductSegment,
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
  /** If set, only these roles see the section */
  roles?: Role[];
  children?: OwnerNavItem[];
};

/**
 * Owner Desktop navigation — ERP module boundaries.
 * URLs stay on existing paths (Stage 2); redirects to /products etc. come later.
 */
export const OWNER_NAV_SECTIONS: OwnerNavSection[] = [
  {
    id: "home",
    labelKey: "nav.home",
    href: "/dashboard",
    icon: "home",
  },
  {
    id: "products",
    labelKey: "nav.products",
    href: "/warehouse/products",
    icon: "products",
    children: [
      { href: "/warehouse/products", labelKey: "nav.productsCatalog" },
      { href: "/warehouse/categories", labelKey: "nav.productsCategories" },
      { href: "/warehouse/brands", labelKey: "nav.productsBrands" },
    ],
  },
  {
    id: "purchases",
    labelKey: "nav.purchases",
    href: "/warehouse/receive",
    icon: "purchases",
    children: [
      { href: "/warehouse/receive", labelKey: "nav.purchasesReceive" },
      { href: "/warehouse/batches", labelKey: "nav.purchasesBatches" },
    ],
  },
  {
    id: "inventory",
    labelKey: "nav.inventory",
    href: "/warehouse",
    icon: "inventory",
    children: [
      { href: "/warehouse", labelKey: "nav.inventoryOverview" },
      { href: "/warehouse/stock", labelKey: "nav.inventoryStock" },
      { href: "/warehouse/transfers", labelKey: "nav.inventoryTransfers" },
      { href: "/warehouse/return-in", labelKey: "nav.inventoryReturnIn" },
      { href: "/warehouse/write-offs", labelKey: "nav.inventoryWriteOffs" },
      { href: "/revision", labelKey: "nav.inventoryRevision" },
      { href: "/warehouse/history", labelKey: "nav.inventoryHistory" },
    ],
  },
  {
    id: "sales",
    labelKey: "nav.sales",
    href: "/returns",
    icon: "sales",
    children: [
      { href: "/returns", labelKey: "nav.salesReturns" },
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
    id: "users",
    labelKey: "nav.users",
    href: "/users",
    icon: "users",
    roles: [Role.OWNER],
  },
  {
    id: "reports",
    labelKey: "nav.reports",
    href: "/analytics",
    icon: "reports",
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
      { href: "/notifications", labelKey: "nav.notifications" },
      { href: "/journal", labelKey: "nav.journal" },
      { href: "/settings", labelKey: "nav.settings" },
    ],
  },
];

/** Filter sections/children by role */
export function filterNavForRole(role: Role): OwnerNavSection[] {
  return OWNER_NAV_SECTIONS.map((section) => {
    if (section.roles && !section.roles.includes(role)) return null;
    if (section.id === "system" && section.children) {
      return {
        ...section,
        children: section.children.filter(
          (c) => !(c.href === "/users" && role !== Role.OWNER)
        ),
      };
    }
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
  if (pathOnly === "/returns") {
    return pathname === "/returns" || pathname.startsWith("/returns/");
  }
  if (pathOnly === "/revision") {
    return pathname === "/revision" || pathname.startsWith("/revision/");
  }
  if (pathOnly === "/users") {
    return pathname === "/users" || pathname.startsWith("/users/");
  }

  return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
}

function isProductCardPath(pathname: string): boolean {
  return warehouseProductSegment(pathname) !== null;
}

export function sectionForPath(pathname: string): OwnerNavSection | undefined {
  if (isProductCardPath(pathname) || pathname.startsWith("/warehouse/new")) {
    return OWNER_NAV_SECTIONS.find((s) => s.id === "products");
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
    crumbs.push({ labelKey: "nav.products", href: "/warehouse/products" });
    crumbs.push({ labelKey: "nav.productsCatalog", href: "/warehouse/products" });
    crumbs.push({ labelKey: "nav.productCard" });
    return crumbs;
  }

  if (pathname.startsWith("/warehouse/new")) {
    crumbs.push({ labelKey: "nav.products", href: "/warehouse/products" });
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
    crumbs.push({ labelKey: "nav.inventory", href: "/warehouse" });
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
