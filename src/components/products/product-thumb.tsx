"use client";

import { cn } from "@/lib/utils";
import {
  getProductImageUrl,
  type ProductImageSize,
} from "@/lib/services/product-image.service";

type Props = {
  /** Raw stored imageUrl (medium path or legacy). Prefer passing product + size via ProductCard. */
  src?: string | null;
  name: string;
  className?: string;
  imgClassName?: string;
  /** Visual box size — maps to thumb/medium/full delivery. */
  size?: "sm" | "md" | "lg";
  /** Override which file variant to request. */
  imageSize?: ProductImageSize;
};

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-10 w-10",
  md: "h-16 w-16",
  lg: "h-24 w-full",
};

function boxToImageSize(
  box: NonNullable<Props["size"]>,
  override?: ProductImageSize
): ProductImageSize {
  if (override) return override;
  // sm → thumb (~300), md → medium (~800), lg → full only for explicit detail/lightbox
  if (box === "sm") return "thumb";
  if (box === "lg") return "full";
  return "medium";
}

/** Shared product photo thumb — object-cover, no distortion. Always size-aware. */
export function ProductThumb({
  src,
  name,
  className,
  imgClassName,
  size = "md",
  imageSize,
}: Props) {
  const initial = (name.trim().slice(0, 1) || "?").toUpperCase();
  const resolved = getProductImageUrl({ imageUrl: src }, boxToImageSize(size, imageSize));

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-xl bg-brand-soft",
        SIZE[size],
        size === "lg" && "aspect-[4/3] h-auto",
        className
      )}
    >
      {resolved ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URLs / local uploads
        <img
          src={resolved}
          alt={name}
          className={cn("h-full w-full object-cover", imgClassName)}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-lg font-bold text-brand">
          {initial}
        </div>
      )}
    </div>
  );
}
