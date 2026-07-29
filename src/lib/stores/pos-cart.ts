"use client";

import { create } from "zustand";

export type PosCartLine = {
  productId: string;
  name: string;
  unitSymbol: string;
  salePrice: number;
  quantity: number;
  max: number;
};

type PosCartState = {
  lines: PosCartLine[];
  add: (item: Omit<PosCartLine, "quantity"> & { quantity?: number }) => void;
  setQty: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  count: () => number;
  subtotal: () => number;
};

export const usePosCart = create<PosCartState>((set, get) => ({
  lines: [],

  add: (item) => {
    const qty = item.quantity ?? 1;
    set((state) => {
      const existing = state.lines.find((l) => l.productId === item.productId);
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.productId === item.productId
              ? {
                  ...l,
                  quantity: Math.min(l.quantity + qty, l.max),
                  max: item.max,
                  salePrice: item.salePrice,
                }
              : l
          ),
        };
      }
      return {
        lines: [
          ...state.lines,
          {
            productId: item.productId,
            name: item.name,
            unitSymbol: item.unitSymbol,
            salePrice: item.salePrice,
            quantity: Math.min(qty, item.max),
            max: item.max,
          },
        ],
      };
    });
  },

  setQty: (productId, quantity) => {
    set((state) => ({
      lines: state.lines
        .map((l) =>
          l.productId === productId
            ? { ...l, quantity: Math.max(0, Math.min(quantity, l.max)) }
            : l
        )
        .filter((l) => l.quantity > 0),
    }));
  },

  remove: (productId) => {
    set((state) => ({
      lines: state.lines.filter((l) => l.productId !== productId),
    }));
  },

  clear: () => set({ lines: [] }),

  count: () => get().lines.reduce((s, l) => s + l.quantity, 0),

  subtotal: () =>
    get().lines.reduce((s, l) => s + l.salePrice * l.quantity, 0),
}));
