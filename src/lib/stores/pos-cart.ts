"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  cartFingerprint,
  cartMatchesSnapshot,
  linesToFingerprintLines,
} from "@/lib/pos/cart-fingerprint";
import { posCartStorageKey } from "@/lib/pos/cart-storage-key";

export type PosCartLine = {
  productId: string;
  name: string;
  unitSymbol: string;
  salePrice: number;
  quantity: number;
  /** Soft cap for +/- (not shown to seller). */
  max: number;
  /** Optional product photo for cart UI. */
  imageUrl?: string | null;
  /** WEIGHT lines require bottle selection. */
  accountingType?: "PIECE" | "WEIGHT";
  /** Bottle is an attribute of a WEIGHT line — never a separate cart row. */
  packagingProductId?: string | null;
  packagingSkuId?: string | null;
  packagingName?: string | null;
};

export type PosDiscountState = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  cartHash: string;
};

export type PosPayment = "CASH" | "CARD" | "TRANSFER";

type PosCartState = {
  lines: PosCartLine[];
  sellerId: string | null;
  storeId: string | null;
  paymentMethod: PosPayment;
  notes: string;
  customerNote: string;
  discount: PosDiscountState | null;
  serverReservationId: string | null;
  _hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  setServerReservationId: (id: string | null) => void;
  /**
   * Bind cart namespace to seller+store. Different pairs = independent carts.
   * Triggers rehydrate from IndexedDB for that namespace.
   */
  bindSession: (sellerId: string, storeId: string) => Promise<void>;
  setPaymentMethod: (m: PosPayment) => void;
  setNotes: (notes: string) => void;
  setCustomerNote: (note: string) => void;
  setDiscount: (d: PosDiscountState | null) => void;
  syncDiscountWithCart: () => void;
  add: (item: Omit<PosCartLine, "quantity"> & { quantity?: number }) => void;
  setQty: (productId: string, quantity: number) => void;
  setPackaging: (
    productId: string,
    packaging: {
      packagingProductId: string;
      packagingSkuId?: string | null;
      packagingName?: string | null;
    }
  ) => void;
  /** Drop illegal packaging SKUs if they were persisted in an older cart. */
  purgePackagingLines: (packagingProductIds: string[]) => void;
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

/** Active namespace for storage keys — sellerId:storeId */
let cartNamespace = "anon";

export function getCartNamespace() {
  return cartNamespace;
}

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

  function namespaced(name: string) {
    return `${name}::${cartNamespace}`;
  }

  async function idbGet(name: string): Promise<string | null> {
    const key = namespaced(name);
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () =>
          resolve(typeof req.result === "string" ? req.result : null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      try {
        return localStorage.getItem(key);
      } catch {
        return memory.get(key) ?? null;
      }
    }
  }

  async function idbSet(name: string, value: string): Promise<void> {
    const key = namespaced(name);
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      try {
        localStorage.setItem(key, value);
      } catch {
        /* optional mirror */
      }
    } catch {
      try {
        localStorage.setItem(key, value);
      } catch {
        memory.set(key, value);
      }
    }
  }

  async function idbRemove(name: string): Promise<void> {
    const key = namespaced(name);
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(key);
    } catch {
      memory.delete(key);
    }
  }

  return {
    getItem: async (name: string) => idbGet(name),
    setItem: async (name: string, value: string) => idbSet(name, value),
    removeItem: async (name: string) => idbRemove(name),
  };
}

const emptyCart = {
  lines: [] as PosCartLine[],
  paymentMethod: "CASH" as PosPayment,
  notes: "",
  customerNote: "",
  discount: null as PosDiscountState | null,
  serverReservationId: null as string | null,
};

export const usePosCart = create<PosCartState>()(
  persist(
    (set, get) => ({
      ...emptyCart,
      sellerId: null,
      storeId: null,
      _hasHydrated: false,

      setHasHydrated: (v) => set({ _hasHydrated: v }),

      setServerReservationId: (id) => set({ serverReservationId: id }),

      bindSession: async (sellerId, storeId) => {
        const prev = get();
        const nextNs = `${sellerId}:${storeId}`;
        if (
          cartNamespace === nextNs &&
          prev.sellerId === sellerId &&
          prev.storeId === storeId &&
          prev._hasHydrated
        ) {
          return;
        }
        // Switch namespace — previous cart already persisted via zustand set()
        cartNamespace = nextNs;
        set({
          ...emptyCart,
          sellerId,
          storeId,
          _hasHydrated: false,
        });
        await usePosCart.persist.rehydrate();
        const after = get();
        // Guard: if hydrated cart belongs to another pair, wipe
        if (
          (after.sellerId && after.sellerId !== sellerId) ||
          (after.storeId && after.storeId !== storeId)
        ) {
          set({
            ...emptyCart,
            sellerId,
            storeId,
            _hasHydrated: true,
          });
        } else {
          set({
            sellerId,
            storeId,
            _hasHydrated: true,
            discount: invalidateDiscountIfNeeded(after.lines, after.discount),
          });
        }
      },

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
        if (
          item.salePrice === 0 &&
          /^флакон\b/i.test(item.name)
        ) {
          return;
        }
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
                    quantity: Math.min(l.quantity + qty, item.max || l.max),
                    max: item.max,
                    salePrice: item.salePrice,
                    imageUrl: item.imageUrl ?? l.imageUrl,
                    accountingType: item.accountingType ?? l.accountingType,
                    packagingProductId:
                      item.packagingProductId ?? l.packagingProductId,
                    packagingSkuId: item.packagingSkuId ?? l.packagingSkuId,
                    packagingName: item.packagingName ?? l.packagingName,
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
                imageUrl: item.imageUrl ?? null,
                accountingType: item.accountingType,
                packagingProductId: item.packagingProductId ?? null,
                packagingSkuId: item.packagingSkuId ?? null,
                packagingName: item.packagingName ?? null,
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

      setPackaging: (productId, packaging) => {
        set((state) => ({
          lines: state.lines.map((l) =>
            l.productId === productId
              ? {
                  ...l,
                  packagingProductId: packaging.packagingProductId,
                  packagingSkuId: packaging.packagingSkuId ?? null,
                  packagingName: packaging.packagingName ?? null,
                }
              : l
          ),
        }));
      },

      purgePackagingLines: (packagingProductIds) => {
        const ban = new Set(packagingProductIds);
        set((state) => {
          const lines = state.lines.filter(
            (l) =>
              !ban.has(l.productId) &&
              !(l.salePrice === 0 && /^флакон\b/i.test(l.name))
          );
          if (lines.length === state.lines.length) return state;
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
          ...emptyCart,
          sellerId: get().sellerId,
          storeId: get().storeId,
          serverReservationId: null,
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
        sellerId: s.sellerId,
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
export { posCartStorageKey };
