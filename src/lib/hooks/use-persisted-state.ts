"use client";

import { useEffect, useState } from "react";

/** Persist list filters in sessionStorage so return to page keeps context. */
export function usePersistedState<T>(key: string, initial: T) {
  const storageKey = `aromat:ui:${key}`;
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, [storageKey]);

  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [storageKey, value, ready]);

  return [value, setValue, ready] as const;
}
