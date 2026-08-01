/**
 * Block 2: POS cart persistence contract + discount invalidation on cart change.
 * Run: npx tsx scripts/test-pos-cart-persist.ts
 */
import assert from "node:assert/strict";
import {
  cartFingerprint,
  cartMatchesSnapshot,
  linesToFingerprintLines,
} from "../src/lib/pos/cart-fingerprint";

type Persisted = {
  lines: Array<{
    productId: string;
    name: string;
    unitSymbol: string;
    salePrice: number;
    quantity: number;
    max: number;
  }>;
  storeId: string | null;
  paymentMethod: "CASH" | "CARD" | "TRANSFER";
  notes: string;
  customerNote: string;
  discount: {
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    originalAmount: number;
    discountAmount: number;
    finalAmount: number;
    cartHash: string;
  } | null;
};

/** Simulates what IndexedDB/localStorage round-trip must preserve. */
function roundTrip(state: Persisted): Persisted {
  return JSON.parse(JSON.stringify(state)) as Persisted;
}

function invalidate(
  lines: Persisted["lines"],
  discount: Persisted["discount"]
): Persisted["discount"] {
  if (!discount) return null;
  const hash = cartFingerprint(linesToFingerprintLines(lines));
  return hash === discount.cartHash ? discount : null;
}

function main() {
  console.log("=== POS cart persist + discount hash ===\n");

  const lines = [
    {
      productId: "p1",
      name: "Dior",
      unitSymbol: "шт",
      salePrice: 100,
      quantity: 1,
      max: 5,
    },
  ];
  const hash = cartFingerprint(linesToFingerprintLines(lines));
  const state: Persisted = {
    lines,
    storeId: "store-1",
    paymentMethod: "CARD",
    notes: "VIP",
    customerNote: "Ахмад",
    discount: {
      id: "dr1",
      status: "APPROVED",
      originalAmount: 100,
      discountAmount: 10,
      finalAmount: 90,
      cartHash: hash,
    },
  };

  const restored = roundTrip(state);
  assert.equal(restored.lines.length, 1);
  assert.equal(restored.paymentMethod, "CARD");
  assert.equal(restored.customerNote, "Ахмад");
  assert.equal(restored.discount?.finalAmount, 90);
  assert.equal(
    restored.discount?.cartHash,
    cartFingerprint(linesToFingerprintLines(restored.lines))
  );
  console.log("✓ Round-trip keeps lines, payment, client, discount");

  const afterAdd = [
    ...restored.lines,
    {
      productId: "p2",
      name: "Chanel",
      unitSymbol: "шт",
      salePrice: 200,
      quantity: 1,
      max: 3,
    },
  ];
  const cleared = invalidate(afterAdd, restored.discount);
  assert.equal(cleared, null);
  console.log("✓ Adding item invalidates APPROVED discount (client hash)");

  assert.equal(
    cartMatchesSnapshot(linesToFingerprintLines(lines), [
      { productId: "p1", quantity: 1, salePrice: 100 },
    ]),
    true
  );
  assert.equal(
    cartMatchesSnapshot(linesToFingerprintLines(afterAdd), [
      { productId: "p1", quantity: 1, salePrice: 100 },
    ]),
    false
  );
  console.log("✓ Server cartMatchesSnapshot rejects changed cart");

  const empty: Persisted = {
    lines: [],
    storeId: "store-1",
    paymentMethod: "CASH",
    notes: "",
    customerNote: "",
    discount: null,
  };
  const emptyRestored = roundTrip(empty);
  assert.equal(emptyRestored.lines.length, 0);
  console.log("✓ Empty cart persists as empty");

  console.log("\nPOS CART PERSIST CONTRACT PASSED");
  console.log(
    "Storage: IndexedDB (aramat-plus-pos) + localStorage mirror · key aramat-pos-cart-v1"
  );
}

main();
