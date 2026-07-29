import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "soft";
type Size = "md" | "sm" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover shadow-sm",
  secondary: "bg-card text-ink border border-border hover:border-brand/40 hover:bg-brand-soft",
  danger: "bg-danger text-white hover:bg-danger/90 shadow-sm",
  ghost: "bg-transparent text-muted hover:bg-brand-soft hover:text-brand",
  soft: "bg-brand-soft text-brand hover:bg-brand/15",
};

const sizes: Record<Size, string> = {
  sm: "rounded-xl px-3 py-2 text-sm font-semibold",
  md: "rounded-xl px-4 py-2.5 text-[15px] font-semibold",
  lg: "rounded-[14px] px-5 py-3.5 text-[15px] font-bold",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: Size;
    fullWidth?: boolean;
  }
>(function Button(
  { className, variant = "primary", size = "md", fullWidth = true, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 transition duration-150 disabled:opacity-50",
        variants[variant],
        sizes[size],
        fullWidth ? "w-full" : "w-auto",
        className
      )}
      {...props}
    />
  );
});
