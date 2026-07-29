import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

export function Card({
  className,
  tap,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tap?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[16px] border border-border bg-card p-5 shadow-[var(--shadow-card)]",
        tap && "cursor-pointer transition duration-150 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md",
        className
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mb-1.5 text-xs font-medium uppercase tracking-wide text-muted", className)}
      {...props}
    />
  );
}

export function SectionTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("mb-3 text-sm font-bold uppercase tracking-wide text-muted", className)}
      {...props}
    />
  );
}

export function FieldLabel({
  className,
  ...props
}: HTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("mb-1.5 block text-sm font-medium text-ink", className)} {...props} />
  );
}

export function Pill({
  className,
  tone = "brand",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "brand" | "success" | "danger" | "warning" | "muted";
}) {
  const tones = {
    brand: "bg-brand-soft text-brand",
    success: "bg-success/10 text-success",
    danger: "bg-danger/10 text-danger",
    warning: "bg-warning/10 text-warning",
    muted: "bg-page text-muted",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
