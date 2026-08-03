"use client";

import { cn } from "@/lib/utils";
import { productImageSrc } from "@/lib/product-image-src";

type Props = {
  src?: string | null;
  name: string;
  className?: string;
  imgClassName?: string;
  size?: "sm" | "md" | "lg";
};

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-10 w-10",
  md: "h-16 w-16",
  lg: "h-24 w-full",
};

/** Shared product photo thumb — object-cover, no distortion. */
export function ProductThumb({
  src,
  name,
  className,
  imgClassName,
  size = "md",
}: Props) {
  const initial = (name.trim().slice(0, 1) || "?").toUpperCase();
  const resolved = productImageSrc(
    src,
    size === "sm" ? "thumb" : size === "lg" ? "full" : "card"
  );

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
        // eslint-disable-next-line @next/next/no-img-element -- data URLs / arbitrary host uploads
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
