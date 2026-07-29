import Link from "next/link";
import { cn } from "@/lib/utils";
import type { BreadcrumbItem } from "@/lib/navigation/owner-nav";

export function Breadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  if (items.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn("mb-3 flex flex-wrap items-center gap-1 text-sm", className)}>
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <span key={`${item.label}-${i}`} className="inline-flex items-center gap-1">
            {i > 0 ? <span className="text-muted/50">/</span> : null}
            {item.href && !last ? (
              <Link href={item.href} className="text-muted hover:text-brand">
                {item.label}
              </Link>
            ) : (
              <span className={cn(last ? "font-medium text-ink" : "text-muted")}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
