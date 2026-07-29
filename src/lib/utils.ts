import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(value: number | string, currency = "с.") {
  const n = typeof value === "string" ? parseFloat(value) : value;
  // Stable separators — Node vs browser ru-RU spaces break hydration
  const formatted = Number(n || 0)
    .toLocaleString("en-US", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    })
    .replace(/,/g, " ");
  return `${formatted} ${currency}`;
}

export function decimalToNumber(value: { toNumber?: () => number } | number | string | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value);
  if (typeof value.toNumber === "function") return value.toNumber();
  return Number(value);
}
