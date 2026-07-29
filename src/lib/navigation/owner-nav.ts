import { Role } from "@prisma/client";
import {
  WAREHOUSE_INTERNAL_NAV,
  isWarehouseNavActive,
} from "@/lib/navigation/warehouse-nav";

export type OwnerNavItem = {
  href: string;
  label: string;
};

export type OwnerNavSection = {
  id: string;
  label: string;
  href: string;
  icon: string;
  /** If set, only these roles see the item */
  roles?: Role[];
  children?: OwnerNavItem[];
};

/**
 * Grouped Owner Desktop navigation — progressive disclosure, not a flat list.
 * Business logic routes unchanged; only IA of the sidebar.
 */
export const OWNER_NAV_SECTIONS: OwnerNavSection[] = [
  {
    id: "home",
    label: "Главная",
    href: "/dashboard",
    icon: "home",
  },
  {
    id: "warehouse",
    label: "Центральный склад",
    href: "/warehouse",
    icon: "warehouse",
    children: [
      { href: "/warehouse", label: "Обзор" },
      { href: "/warehouse/products", label: "Каталог" },
      { href: "/warehouse/stock", label: "Остатки" },
      { href: "/warehouse/receive", label: "Поступления" },
      { href: "/warehouse/transfers", label: "Отправки" },
      { href: "/returns", label: "Возвраты" },
      { href: "/warehouse/return-in", label: "Возврат на склад" },
      { href: "/warehouse/write-offs", label: "Списания" },
      { href: "/revision", label: "Ревизии" },
      { href: "/warehouse/history", label: "История" },
      { href: "/warehouse/batches", label: "Партии" },
      { href: "/warehouse/categories", label: "Категории" },
      { href: "/warehouse/brands", label: "Бренды" },
    ],
  },
  {
    id: "stores",
    label: "Магазины",
    href: "/stores",
    icon: "stores",
    children: [
      { href: "/stores", label: "Все магазины" },
      { href: "/stores#owner-direct", label: "Личные продажи" },
    ],
  },
  {
    id: "analytics",
    label: "Аналитика",
    href: "/analytics",
    icon: "analytics",
    children: [
      { href: "/analytics?view=network", label: "Сеть" },
      { href: "/analytics?view=stores", label: "Магазины" },
      { href: "/analytics?view=products", label: "Товары" },
      { href: "/analytics?view=sellers", label: "Продавцы" },
      { href: "/analytics?view=expenses", label: "Финансы" },
    ],
  },
  {
    id: "system",
    label: "Система",
    href: "/settings",
    icon: "settings",
    children: [
      { href: "/users", label: "Пользователи" },
      { href: "/notifications", label: "Уведомления" },
      { href: "/journal", label: "Журнал действий" },
      { href: "/settings", label: "Настройки" },
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
  // Prefer deepest matching child section
  for (const section of OWNER_NAV_SECTIONS) {
    if (section.children?.some((c) => isPathActive(pathname, c.href))) {
      return section;
    }
  }
  return OWNER_NAV_SECTIONS.find((s) => isPathActive(pathname, s.href));
}

export type BreadcrumbItem = { label: string; href?: string };

export function breadcrumbsForPath(pathname: string): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [{ label: "Главная", href: "/dashboard" }];

  if (pathname.startsWith("/warehouse")) {
    crumbs.push({ label: "Центральный склад", href: "/warehouse" });
    const productMatch = pathname.match(/^\/warehouse\/([^/]+)$/);
    if (productMatch && !["new", "products", "stock", "categories", "brands", "batches", "receive", "transfers", "return-in", "write-offs", "history"].includes(productMatch[1])) {
      crumbs.push({ label: "Каталог", href: "/warehouse/products" });
      crumbs.push({ label: "Карточка товара" });
      return crumbs;
    }
    if (pathname.startsWith("/warehouse/new")) {
      crumbs.push({ label: "Каталог", href: "/warehouse/products" });
      crumbs.push({ label: "Новый товар" });
      return crumbs;
    }
    const inner = WAREHOUSE_INTERNAL_NAV.find(
      (n) => n.href !== "/warehouse" && isWarehouseNavActive(pathname, n.href)
    );
    if (inner) crumbs.push({ label: inner.label });
    return crumbs;
  }

  if (pathname.startsWith("/stores/") && pathname !== "/stores") {
    crumbs.push({ label: "Магазины", href: "/stores" });
    if (pathname.endsWith("/pos")) {
      crumbs.push({ label: "Магазин" });
      crumbs.push({ label: "Продажи владельца" });
    } else {
      crumbs.push({ label: "Карточка магазина" });
    }
    return crumbs;
  }

  const section = sectionForPath(pathname);
  if (!section || section.id === "home") return crumbs;

  crumbs.push({
    label: section.label,
    href: section.href,
  });

  if (section.children) {
    const child = section.children.find((c) => isPathActive(pathname, c.href));
    if (child && child.href.split("?")[0] !== section.href) {
      crumbs.push({ label: child.label });
    }
  }

  return crumbs;
}

export function sectionTitleForPath(pathname: string): string {
  const section = sectionForPath(pathname);
  if (!section) return "AROMAT PLUS ERP";

  if (section.children) {
    const child = section.children.find((c) => isPathActive(pathname, c.href));
    if (child) return child.label;
  }

  return section.label;
}

/** @deprecated */
export const WAREHOUSE_SUBNAV: { href: string; label: string; icon: string }[] =
  [];
