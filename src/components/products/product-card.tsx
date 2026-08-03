"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { resolveProductImageUrl } from "@/lib/product-image";
import { ProductThumb } from "@/components/products/product-thumb";
import { useI18n } from "@/components/i18n/i18n-provider";
import { labelProductType } from "@/lib/i18n/labels";

export type ProductCardProduct = {
  id: string;
  name: string;
  imageUrl?: string | null;
  brand?: { name?: string | null; imageUrl?: string | null } | null;
  category?: { name?: string | null } | null;
  productType?: { name?: string | null } | null;
  unit?: { symbol?: string | null } | null;
  accountingType?: "PIECE" | "WEIGHT" | string | null;
  salePrice?: number | string | null;
};

export type ProductCardMode = "warehouse" | "transfer" | "pos" | "store";

type Props = {
  product: ProductCardProduct;
  mode: ProductCardMode;
  quantity?: number | null;
  statusLabel?: string | null;
  statusTone?: string | null;
  stockStatus?: "OK" | "LOW" | "OUT";
  href?: string;
  disabled?: boolean;
  onClick?: () => void;
  /** Extra actions under meta (edit, receive, send, qty controls…). */
  actions?: ReactNode;
  className?: string;
  /** When true, render as button (POS tap-to-add). */
  asButton?: boolean;
};

function saleModeLabel(
  accountingType: string | null | undefined,
  t: (key: string) => string
) {
  return accountingType === "WEIGHT"
    ? t("warehouse.unitMl")
    : t("warehouse.unitPcs");
}

/**
 * Single product card used across warehouse, transfers, store stock, and POS.
 * Modes only change density and which actions/footer are shown — same photo source.
 */
export function ProductCard({
  product,
  mode,
  quantity,
  statusLabel,
  statusTone,
  stockStatus,
  href,
  disabled,
  onClick,
  actions,
  className,
  asButton,
}: Props) {
  const { t, formatMoney } = useI18n();
  const imageUrl = resolveProductImageUrl(product);
  const brandName = product.brand?.name ?? null;
  const categoryName = product.category?.name ?? null;
  const typeName = product.productType?.name
    ? labelProductType(product.productType.name, t)
    : null;
  const unit = product.unit?.symbol ?? "";
  const saleMode = saleModeLabel(product.accountingType, t);

  const meta = (
    <>
      <div
        className={cn(
          "font-semibold text-ink",
          mode === "pos" ? "line-clamp-2 text-sm" : "line-clamp-2 text-base"
        )}
      >
        {product.name}
      </div>
      {brandName ? (
        <div className="mt-0.5 text-xs text-muted">{brandName}</div>
      ) : null}
      {mode !== "pos" ? (
        <div className="mt-1.5 space-y-0.5 text-xs text-muted">
          {categoryName ? (
            <div>
              {t("wh.categoriesTitle")}: {categoryName}
            </div>
          ) : null}
          <div>
            {t("wh.colType")}: {typeName ?? "—"}
          </div>
          <div>
            {saleMode}
            {unit ? ` · ${unit}` : ""}
          </div>
        </div>
      ) : null}
      {mode === "warehouse" || mode === "transfer" || mode === "store" ? (
        <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
          {quantity != null ? (
            <span className="text-sm font-semibold text-ink">
              {t("wh.colQty")} {quantity}
              {unit}
            </span>
          ) : (
            <span />
          )}
          {product.salePrice != null && mode !== "transfer" ? (
            <span className="text-sm font-bold text-ink">
              {formatMoney(Number(product.salePrice))}
            </span>
          ) : null}
        </div>
      ) : null}
      {mode === "pos" ? (
        <div className="mt-2 flex items-end justify-between gap-1">
          <span className="text-sm font-bold text-ink">
            {formatMoney(Number(product.salePrice ?? 0))}
          </span>
          {stockStatus ? (
            <span
              className={cn(
                "text-[11px] font-semibold",
                stockStatus === "OK" && "text-success",
                stockStatus === "LOW" && "text-warning",
                stockStatus === "OUT" && "text-danger"
              )}
            >
              {stockStatus === "OUT"
                ? t("pos.outOfStock")
                : stockStatus === "LOW"
                  ? t("pos.lowStock")
                  : t("pos.inStock")}
            </span>
          ) : null}
        </div>
      ) : null}
      {statusLabel ? (
        <span
          className={cn(
            "mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
            statusTone ?? "bg-muted/20 text-muted"
          )}
        >
          {statusLabel}
        </span>
      ) : null}
    </>
  );

  const media = (
    <>
      <ProductThumb
        src={imageUrl}
        name={product.name}
        size="lg"
        className={mode === "pos" ? "mb-2" : "mb-3"}
      />
      {meta}
    </>
  );

  const shellClass = cn(
    "rounded-2xl border border-border bg-card p-3 text-left shadow-sm transition",
    mode === "pos" && "active:scale-[0.98]",
    stockStatus === "LOW" && "ring-1 ring-warning/40",
    (stockStatus === "OUT" || disabled) && "opacity-50",
    !asButton && !href && onClick && "cursor-pointer hover:border-brand/30",
    className
  );

  if (asButton) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={shellClass}
      >
        {media}
        {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
      </button>
    );
  }

  return (
    <div className={cn(shellClass, "flex h-full flex-col")}>
      {href ? (
        <Link href={href} className="min-w-0 flex-1 block" onClick={onClick}>
          {media}
        </Link>
      ) : (
        <div
          className={cn("min-w-0 flex-1", onClick && "cursor-pointer")}
          onClick={onClick}
          onKeyDown={
            onClick
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") onClick();
                }
              : undefined
          }
          role={onClick ? "button" : undefined}
          tabIndex={onClick ? 0 : undefined}
        >
          {media}
        </div>
      )}
      {actions ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
