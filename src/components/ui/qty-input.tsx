"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type QtyInputProps = {
  value: number;
  max: number;
  /** Floor for − button and committed values. Default 1 for integer, 0.001 otherwise. */
  min?: number;
  integer?: boolean;
  /** Called only with a finite number in [min, max]. Never called for empty draft. */
  onChange: (next: number) => void;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
  "aria-label"?: string;
};

function clamp(n: number, min: number, max: number, integer: boolean): number {
  let v = Math.min(max, Math.max(min, n));
  if (integer) v = Math.round(v);
  return v;
}

function parseDraft(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "" || t === "-" || t === "." || t === "-.") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Quantity control: editable number field + −/+ .
 * Empty field while typing does not commit 0 / remove the line.
 */
export function QtyInput({
  value,
  max,
  min: minProp,
  integer = false,
  onChange,
  className,
  inputClassName,
  buttonClassName,
  "aria-label": ariaLabel,
}: QtyInputProps) {
  const min = minProp ?? (integer ? 1 : 0.001);
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? String(value);

  function commit(raw: string) {
    const parsed = parseDraft(raw);
    if (parsed == null || parsed < min) {
      setDraft(null);
      return;
    }
    const next = clamp(parsed, min, max, integer);
    setDraft(null);
    if (next !== value) onChange(next);
  }

  function bump(delta: number) {
    const next = clamp(value + delta, min, max, integer);
    setDraft(null);
    if (next !== value) onChange(next);
  }

  const btn = cn(
    "h-9 w-9 shrink-0 rounded-[9px] border border-line bg-surface2 text-lg leading-none disabled:opacity-40",
    buttonClassName
  );

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        type="button"
        className={btn}
        onClick={() => bump(-1)}
        disabled={value <= min}
        aria-label="−"
      >
        −
      </button>
      <input
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        aria-label={ariaLabel}
        className={cn(
          "w-20 min-w-0 rounded-lg border border-line bg-surface px-2 py-1.5 text-center tabular-nums outline-none focus:border-brand",
          inputClassName
        )}
        value={display}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw !== "" && !/^[0-9]*[.,]?[0-9]*$/.test(raw)) return;
          setDraft(raw);
          const parsed = parseDraft(raw);
          if (parsed == null || parsed < min) return;
          // Defer 0 to blur so POS lines aren't removed mid-keystroke
          if (parsed === 0) return;
          if (parsed <= max) {
            const next = clamp(parsed, min, max, integer);
            if (next !== value) onChange(next);
          }
        }}
        onBlur={() => commit(display)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <button
        type="button"
        className={btn}
        onClick={() => bump(1)}
        disabled={value >= max}
        aria-label="+"
      >
        +
      </button>
    </div>
  );
}
