"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  cartFingerprint,
  cartMatchesSnapshot,
  linesToFingerprintLines,
} from "@/lib/pos/cart-fingerprint";

export type PosCartLine = {
  productId: string;
  name: string;
  unitSymbol: string;
  salePrice: number;
  quantity: number;
  max: number;
};

export type PosDiscountState = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  /** Snapshot hash at request time — must match current cart. */
  cartHash: string;
};

export type PosPayment = "CASH" | "CARD" | "TRANSFER";

type PosCartState = {
  lines: PosCartLine[];
  storeId: string | null;
  paymentMethod: PosPayment;
  notes: string;
  customerNote: string;
  discount: PosDiscountState | null;
  /** True after persist rehydration (client). */
  _hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  setStoreId: (storeId: string | null) => void;
  setPaymentMethod: (m: PosPayment) => void;
  setNotes: (notes: string) => void;
  setCustomerNote: (note: string) => void;
  setDiscount: (d: PosDiscountState | null) => void;
  /** Drop discount if cart no longer matches approved/pending snapshot. */
  syncDiscountWithCart: () => void;
  add: (item: Omit<PosCartLine, "quantity"> & { quantity?: number }) => void;
  setQty: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  count: () => number;
  subtotal: () => number;
  cartHash: () => string;
};

function invalidateDiscountIfNeeded(
  lines: PosCartLine[],
  discount: PosDiscountState | null
): PosDiscountState | null {
  if (!discount) return null;
  const hash = cartFingerprint(linesToFingerprintLines(lines));
  if (hash !== discount.cartHash) return null;
  return discount;
}

/** IndexedDB storage for Zustand persist (falls back to localStorage). */
function createIdbStorage() {
  const DB = "aramat-plus-pos";
  const STORE = "kv";
  const memory = new Map<string, string>();

  function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("NO_IDB"));
        return;
      }
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(name: string): Promise<string | null> {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(name);
        req.onsuccess = () =>
          resolve(typeof req.result === "string" ? req.result : null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      try {
        return localStorage.getItem(name);
      } catch {
        return memory.get(name) ?? null;
      }
    }
  }

  async function idbSet(name: string, value: string): Promise<void> {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, name);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      try {
        localStorage.setItem(name, value);
      } catch {
        /* mirror optional */
      }
    } catch {
      try {
        localStorage.setItem(name, value);
      } catch {
        memory.set(name, value);
      }
    }
  }

  async function idbRemove(name: string): Promise<void> {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(name);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(name);
    } catch {
      memory.delete(name);
    }
  }

  return {
    getItem: async (name: string): Promise<string | null> => idbGet(name),
    setItem: async (name: string, value: string): Promise<void> =>
      idbSet(name, value),
    removeItem: async (name: string): Promise<void> => idbRemove(name),
  };
}

export const usePosCart = create<PosCartState>()(
  persist(
    (set, get) => ({
      lines: [],
      storeId: null,
      paymentMethod: "CASH",
      notes: "",
      customerNote: "",
      discount: null,
      _hasHydrated: false,

      setHasHydrated: (v) => set({ _hasHydrated: v }),

      setStoreId: (storeId) => set({ storeId }),

      setPaymentMethod: (paymentMethod) => set({ paymentMethod }),

      setNotes: (notes) => set({ notes }),

      setCustomerNote: (customerNote) => set({ customerNote }),

      setDiscount: (discount) => set({ discount }),

      syncDiscountWithCart: () => {
        const { lines, discount } = get();
        const next = invalidateDiscountIfNeeded(lines, discount);
        if (next !== discount) set({ discount: next });
      },

      add: (item) => {
        const qty = item.quantity ?? 1;
        set((state) => {
          const existing = state.lines.find(
            (l) => l.productId === item.productId
          );
          let lines: PosCartLine[];
          if (existing) {
            lines = state.lines.map((l) =>
              l.productId === item.productId
                ? {
                    ...l,
                    quantity: Math.min(l.quantity + qty, l.max),
                    max: item.max,
                    salePrice: item.salePrice,
                  }
                : l
            );
          } else {
            lines = [
              ...state.lines,
              {
                productId: item.productId,
                name: item.name,
                unitSymbol: item.unitSymbol,
                salePrice: item.salePrice,
                quantity: Math.min(qty, item.max),
                max: item.max,
              },
            ];
          }
          return {
            lines,
            discount: invalidateDiscountIfNeeded(lines, state.discount),
          };
        });
      },

      setQty: (productId, quantity) => {
        set((state) => {
          const lines = state.lines
            .map((l) =>
              l.productId === productId
                ? {
                    ...l,
                    quantity: Math.max(0, Math.min(quantity, l.max)),
                  }
                : l
            )
            .filter((l) => l.quantity > 0);
          return {
            lines,
            discount: invalidateDiscountIfNeeded(lines, state.discount),
          };
        });
      },

      remove: (productId) => {
        set((state) => {
          const lines = state.lines.filter((l) => l.productId !== productId);
          return {
            lines,
            discount: invalidateDiscountIfNeeded(lines, state.discount),
          };
        });
      },

      clear: () =>
        set({
          lines: [],
          discount: null,
          notes: "",
          customerNote: "",
          paymentMethod: "CASH",
        }),

      count: () => get().lines.reduce((s, l) => s + l.quantity, 0),

      subtotal: () =>
        get().lines.reduce((s, l) => s + l.salePrice * l.quantity, 0),

      cartHash: () =>
        cartFingerprint(linesToFingerprintLines(get().lines)),
    }),
    {
      name: "aramat-pos-cart-v1",
      storage: createJSONStorage(() => createIdbStorage()),
      partialize: (s) => ({
        lines: s.lines,
        storeId: s.storeId,
        paymentMethod: s.paymentMethod,
        notes: s.notes,
        customerNote: s.customerNote,
        discount: s.discount,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
        state?.syncDiscountWithCart();
      },
    }
  )
);

export function discountMatchesCart(
  discount: PosDiscountState | null,
  lines: PosCartLine[]
): boolean {
  if (!discount) return false;
  return discount.cartHash === cartFingerprint(linesToFingerprintLines(lines));
}

export { cartMatchesSnapshot };
