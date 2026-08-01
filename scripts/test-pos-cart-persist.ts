/**
 * Block 2 control: POS cart persistence + seller/store namespace + discount hash.
 * Covers the 5 acceptance scenarios as pure contracts (storage key + invalidate).
 * Run: npx tsx scripts/test-pos-cart-persist.ts
 */
import assert from "node:assert/strict";
import {
  cartFingerprint,
  cartMatchesSnapshot,
  linesToFingerprintLines,
} from "../src/lib/pos/cart-fingerprint";
import { posCartStorageKey } from "../src/lib/pos/cart-storage-key";

type Persisted = {
  lines: Array<{
    productId: string;
    name: string;
    unitSymbol: string;
    salePrice: number;
    quantity: number;
    max: number;
  }>;
  sellerId: string | null;
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

/** Simulates IndexedDB/localStorage round-trip. */
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

/** Two independent buckets — Scenario 3 (Seller A/Store1 vs Seller B/Store2). */
class NamespaceStore {
  private buckets = new Map<string, string>();

  save(sellerId: string, storeId: string, state: Persisted) {
    this.buckets.set(posCartStorageKey(sellerId, storeId), JSON.stringify(state));
  }

  load(sellerId: string, storeId: string): Persisted | null {
    const raw = this.buckets.get(posCartStorageKey(sellerId, storeId));
    return raw ? (JSON.parse(raw) as Persisted) : null;
  }
}

function main() {
  console.log("=== POS cart persist · 5 scenarios ===\n");

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
    sellerId: "seller-a",
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

  // Scenario 1 — close tab / reopen
  const restored = roundTrip(state);
  assert.equal(restored.lines.length, 1);
  assert.equal(restored.paymentMethod, "CARD");
  assert.equal(restored.customerNote, "Ахмад");
  assert.equal(restored.storeId, "store-1");
  console.log("✓ S1 Close tab → reopen: cart restored");

  // Scenario 2 — logout / login same seller+store
  const store = new NamespaceStore();
  store.save("seller-a", "store-1", state);
  const afterLogin = store.load("seller-a", "store-1");
  assert.ok(afterLogin);
  assert.equal(afterLogin!.lines.length, 1);
  assert.equal(afterLogin!.discount?.finalAmount, 90);
  console.log("✓ S2 Logout → login same seller+store: cart restored");

  // Scenario 3 — independent carts
  const sellerB: Persisted = {
    ...emptyCart("seller-b", "store-2"),
    lines: [
      {
        productId: "p9",
        name: "Chanel",
        unitSymbol: "шт",
        salePrice: 200,
        quantity: 2,
        max: 5,
      },
    ],
  };
  store.save("seller-b", "store-2", sellerB);
  const a = store.load("seller-a", "store-1")!;
  const b = store.load("seller-b", "store-2")!;
  assert.equal(a.lines[0].productId, "p1");
  assert.equal(b.lines[0].productId, "p9");
  assert.notEqual(
    posCartStorageKey("seller-a", "store-1"),
    posCartStorageKey("seller-b", "store-2")
  );
  console.log("✓ S3 Seller A/Store1 vs Seller B/Store2: carts independent");

  // Scenario 4 — offline refresh (local persistence, no network)
  const offline = roundTrip(state);
  assert.equal(offline.lines.length, 1);
  assert.equal(offline.notes, "VIP");
  console.log("✓ S4 Offline refresh: cart remains (local store)");

  // Scenario 5 — approved discount survives; change line clears it
  assert.equal(restored.discount?.finalAmount, 90);
  assert.equal(
    restored.discount?.cartHash,
    cartFingerprint(linesToFingerprintLines(restored.lines))
  );
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
  console.log("✓ S5 Discount 90 survives reopen; line change clears discount");

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

  console.log("\nPOS CART 5-SCENARIO CONTRACT PASSED");
  console.log(
    "Storage: IndexedDB (aramat-plus-pos) · key aramat-pos-cart-v1:{sellerId}:{storeId}"
  );
}

function emptyCart(sellerId: string, storeId: string): Persisted {
  return {
    lines: [],
    sellerId,
    storeId,
    paymentMethod: "CASH",
    notes: "",
    customerNote: "",
    discount: null,
  };
}

main();
