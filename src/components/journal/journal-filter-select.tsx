"use client";

import { cn } from "@/lib/utils";
import { FieldLabel } from "@/components/ui/card";

export type JournalSelectOption = {
  value: string;
  label: string;
};

/** Reusable compact select used by journal (and other filter bars). */
export function JournalFilterSelect({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: JournalSelectOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("min-w-[9rem] flex-1", className)}>
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
