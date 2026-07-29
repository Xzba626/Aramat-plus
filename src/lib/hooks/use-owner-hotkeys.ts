"use client";

import { useEffect } from "react";

/** `/` focuses global search; Esc blurs it / closes open dialogs with [data-dismiss-esc]. */
export function useOwnerHotkeys() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const el = document.getElementById(
          "owner-global-search"
        ) as HTMLInputElement | null;
        el?.focus();
        el?.select();
        return;
      }

      if (e.key === "Escape") {
        const open = document.querySelectorAll("[data-dismiss-esc]");
        if (open.length) {
          const last = open[open.length - 1] as HTMLElement;
          last.click();
          return;
        }
        const search = document.getElementById(
          "owner-global-search"
        ) as HTMLInputElement | null;
        if (search && document.activeElement === search) search.blur();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
