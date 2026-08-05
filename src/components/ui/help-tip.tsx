"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { useT } from "@/components/i18n/i18n-provider";
import { cn } from "@/lib/utils";

export function HelpTip({
  hintKey,
  className,
  children,
}: {
  /** Message key under hints.* or full path */
  hintKey: string;
  className?: string;
  children?: ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const key = hintKey.startsWith("hints.") ? hintKey : `hints.${hintKey}`;
  const text = t(key);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <span ref={ref} className={cn("relative inline-flex items-center gap-1", className)}>
      {children}
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] font-bold text-muted hover:border-brand hover:text-brand"
        aria-label={text}
        title={text}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-40 mb-1.5 w-56 -translate-x-1/2 rounded-lg border border-border bg-card px-2.5 py-2 text-left text-xs font-normal normal-case tracking-normal text-ink shadow-lg"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
