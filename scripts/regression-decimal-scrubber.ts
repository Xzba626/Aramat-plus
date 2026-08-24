/**
 * DB-free regression test: Prisma.Decimal survives stripFinanceForRole / stripExactStockForManager.
 *
 * Purpose: PROVE without a running Postgres that:
 *   (A) Old `constructor.name === "Decimal"` detection FAILS when ctor name is mangled.
 *   (B) New 3-tier `isPrismaDecimal()` (instanceof → name → duck) PRESERVES Decimals correctly.
 *
 * We cannot turn off real minification here, but we CAN simulate its effect
 * by wrapping Prisma.Decimal instances in a Proxy that lies about constructor.name,
 * which reproduces exactly what Terser does (changes the name string while keeping
 * instanceof intact).
 *
 * Run:  .\node_modules\.bin\tsx.cmd scripts\regression-decimal-scrubber.ts
 */
import { Prisma, Role } from "@prisma/client";
import {
  stripFinanceForRole,
  isFinanceFieldKey,
} from "../src/lib/finance-visibility";
import { stripExactStockForManager } from "../src/lib/permissions/manager-response";

// ---------- helpers ----------
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`❌ FAIL: ${msg}`);
}

type FakeDecimal = Prisma.Decimal;

/** Simulate Terser mangling: hide constructor.name while keeping instanceof intact. */
function simulateMangledDecimal(d: FakeDecimal): FakeDecimal {
  // Prisma.Decimal constructor name might be mangled. We cannot re-define `constructor.name`
  // on a Prisma.Decimal prototype, but we CAN wrap it in a Proxy that intercepts
  // `constructor` access — this matches exactly what the old detection code sees:
  //   (value as any).constructor?.name === "Decimal" → FALSE
  // while:
  //   value instanceof Prisma.Decimal → still TRUE
  return new Proxy(d, {
    get(target: any, prop, recv) {
      if (prop === "constructor") {
        // Return a "fake" constructor object whose .name is mangled.
        const FakeCtor = Object.defineProperty(
          function () {} as any,
          "name",
          { value: "a" } // this is what Terser reduces constructor names to (single letter)
        );
        // but .name should still be writable via define on the instance — so the name is "a"
        return FakeCtor;
      }
      return Reflect.get(target, prop, recv);
    },
  }) as unknown as FakeDecimal;
}

/** Reproduce the OLD stripFinanceDeep logic (commit f1dd9b5 pre-fix) for side-by-side. */
type AnyRecord = Record<string, unknown>;
function OLD_isFinanceFieldKey(key: string): boolean {
  return isFinanceFieldKey(key); // identical; bug was in short-circuit, not in key-pattern
}
function OLD_stripFinanceDeep(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(OLD_stripFinanceDeep);
  if (typeof value !== "object") return value;
  // OLD — fragile, only checks the string name
  const ctor = (value as { constructor?: { name?: string } }).constructor?.name;
  if (ctor === "Decimal" || ctor === "Date" || value instanceof Date) {
    return value;
  }
  const src = value as AnyRecord;
  const out: AnyRecord = {};
  for (const [k, v] of Object.entries(src)) {
    if (OLD_isFinanceFieldKey(k)) continue;
    out[k] = v && typeof v === "object" ? OLD_stripFinanceDeep(v) : v;
  }
  return out;
}
function OLD_stripFinanceForRole<T>(data: T): T {
  return OLD_stripFinanceDeep(data) as T;
}

// ---------- build a synthetic payload (no DB) ----------
function makeTotal(n: number) {
  return new Prisma.Decimal(n.toString());
}

type SyntheticSale = {
  id: string;
  total: FakeDecimal;
  subtotal: FakeDecimal;
  discountAmount: FakeDecimal;
  costPerUnit: FakeDecimal; // must be scrubbed (finance key)
  items: Array<{
    id: string;
    quantity: FakeDecimal;
    salePrice: FakeDecimal;
    costPerUnit: FakeDecimal; // must be scrubbed
    product: { name: string };
  }>;
};

const sale: SyntheticSale = {
  id: "TTT9AASL",
  total: makeTotal(145.5),
  subtotal: makeTotal(150),
  discountAmount: makeTotal(4.5),
  costPerUnit: makeTotal(70), // should be scrubbed
  items: [
    {
      id: "si1",
      quantity: makeTotal(2),
      salePrice: makeTotal(50),
      costPerUnit: makeTotal(22),
      product: { name: "Кирки" },
    },
    {
      id: "si2",
      quantity: makeTotal(1),
      salePrice: makeTotal(45.5),
      costPerUnit: makeTotal(26),
      product: { name: "Кола 0.5" },
    },
  ],
};

// Apply mangling: wrap every Decimal in our payload through the mangling proxy so
// the OLD method sees ctor.name !== "Decimal".
function mangleAllDecimals<T>(v: T): T {
  if (v == null) return v;
  if (v instanceof Prisma.Decimal) return simulateMangledDecimal(v) as unknown as T;
  if (Array.isArray(v)) return (v as any).map(mangleAllDecimals) as unknown as T;
  if (typeof v === "object") {
    const out: any = {};
    for (const [k, x] of Object.entries(v as any)) {
      out[k] = mangleAllDecimals(x);
    }
    return out as unknown as T;
  }
  return v;
}

const mangledSale: SyntheticSale = mangleAllDecimals(sale);

// Fake a SELLER-class user (non-owner) so stripFinanceForRole actually scrubs.
const sellerUser = {
  id: "u-seller-1",
  role: Role.SELLER,
  companyId: "c-1",
  storeId: "s-1",
} as any;
const managerUser = {
  id: "u-mgr-1",
  role: Role.MANAGER,
  companyId: "c-1",
} as any;

// ---------- RUN COMPARISON ----------
console.log("=== Decimal scrubber regression: OLD (f1dd9b5) vs NEW (fixed) ===\n");

console.log("--- 1. Raw values (before scrub) ---");
console.log("  sale.total =", sale.total.toString(), "  typeof total =", typeof sale.total);
console.log("  items[0].quantity =", sale.items[0].quantity.toString());
console.log("  Mangled sale.total.constructor.name =", (mangledSale.total as any).constructor?.name);
console.log("  Mangled total instanceof Prisma.Decimal?", mangledSale.total instanceof Prisma.Decimal);
console.log();

// ---------- A. OLD strip with MANGLED Decimals ----------
console.log("--- 2. OLD stripFinanceForRole on MANGLED payload (expects FAIL) ---");
const oldOut = OLD_stripFinanceForRole(mangledSale);
const oldJson = JSON.stringify(oldOut, null, 2);
console.log(oldJson);
const oldTotalType = typeof (oldOut as any).total;
const oldTotalVal = (oldOut as any).total;
const oldQtyVal = (oldOut as any).items[0].quantity;
console.log();
console.log("OLD.total type     =", oldTotalType);
console.log("OLD.total          =", JSON.stringify(oldTotalVal));
console.log("OLD.items[0].qty   =", JSON.stringify(oldQtyVal));
console.log("OLD Number(total)  =", Number(oldTotalVal));          // should be NaN or 0
console.log("OLD NaN position?  =", Number(Object.keys(oldQtyVal).length));
console.log();

// ---------- B. NEW strip with MANGLED Decimals ----------
console.log("--- 3. NEW stripFinanceForRole on MANGLED payload (expects CORRECT) ---");
const newOut = stripFinanceForRole(sellerUser, mangledSale);
const newJson = JSON.stringify(newOut, null, 2);
console.log(newJson);
const newTotal: any = (newOut as any).total;
const newItems: any[] = (newOut as any).items;
console.log();
console.log("NEW.total string   =", JSON.stringify(newTotal), "  (should be '145.5')");
console.log("NEW.items[0].qty   =", JSON.stringify(newItems[0].quantity), "(should be '2')");
console.log("NEW Number(total)  =", Number(newTotal));
console.log("NEW sum qty        =", newItems.reduce((a, b) => a + Number(b.quantity), 0), "(should be 3)");
console.log();

// ---------- C. Finance fields MUST still be scrubbed (regression safety) ----------
console.log("--- 4. Finance fields MUST remain scrubbed with NEW method ---");
console.log("  NEW.costPerUnit (root):", "costPerUnit" in (newOut as any) ? "PRESENT ❌" : "SCRUBBED ✅");
console.log("  NEW.items[0].costPerUnit:", "costPerUnit" in (newItems as any)[0] ? "PRESENT ❌" : "SCRUBBED ✅");
console.log("  NEW.discountAmount kept (not a finance field):", "discountAmount" in (newOut as any) ? "KEPT ✅" : "SCRUBBED ❌");
console.log();

// ---------- D. Manager exact-stock scrubber: Decimals should survive, but stock qtys stripped ----------
console.log("--- 5. NEW stripExactStockForManager with MANGLED payload ---");
const mgrPayload = mangleAllDecimals({
  id: "prod-X",
  name: "Кирки",
  quantity: new Prisma.Decimal(7),
  qty: new Prisma.Decimal(7),
  physicalQty: new Prisma.Decimal(7),
  unitsTotal: new Prisma.Decimal(100),
  // Transfer item (operational qty, not stock): KEEP its quantity
  transfers: [
    { transferId: "t1", productId: "prod-X", quantity: new Prisma.Decimal(5) },
  ],
} as any);
const mgrOut = stripExactStockForManager(managerUser, mgrPayload);
const _jsonableMgr = JSON.parse(JSON.stringify(mgrOut));
console.log(JSON.stringify(mgrOut, null, 2));
console.log();
console.log("  quantity key scrubbed?", "quantity" in mgrOut ? "PRESENT ❌" : "SCRUBBED ✅");
console.log("  physicalQty scrubbed?", "physicalQty" in mgrOut ? "PRESENT ❌" : "SCRUBBED ✅");
const transferItems: any[] = (mgrOut as any).transfers;
const transferItemQtyKept = String(transferItems?.[0]?.quantity) === "5";
console.log("  TransferItem.quantity KEPT (operational)?", transferItemQtyKept ? "KEPT ✅" : "LOST ❌ (was=", transferItems?.[0]?.quantity, ")");
console.log();

// ---------- ASSERTIONS ----------
console.log("=== ASSERTIONS ===");

// OLD: proves corruption exists
console.log("A. OLD (f1dd9b5) corruption proof:");
assert(Number(oldTotalVal) !== 145.5, "OLD.total should be CORRUPTED (not 145.5 number). OLD mangling bug is confirmed.");
assert(
  typeof oldTotalVal !== "string" || oldTotalVal !== "145.5",
  "OLD.total should be corrupted object {}, not string '145.5'"
);
console.log("   ✓ OLD method produces corrupted total value for mangled Decimal (bug reproduced)");

// NEW: proves correctness
console.log("B. NEW (fixed) correctness:");
assert(Number(newTotal) === 145.5, `NEW total should be 145.5 (got Number=${Number(newTotal)}, str=${JSON.stringify(newTotal)})`);
assert(newItems.reduce((a: number, b: any) => a + Number(b.quantity), 0) === 3, "NEW sum of qty should be 3");
console.log("   ✓ NEW method preserves mangled Decimal → correct JSON strings for total/qty");

// Finance fields remain scrubbed
console.log("C. Finance scrubbing still enforced (RBAC preserved):");
assert(!("costPerUnit" in (newOut as any)), "NEW: root costPerUnit must be scrubbed (SELLER must not see COGS)");
assert(!("costPerUnit" in newItems[0]), "NEW: item-level costPerUnit must be scrubbed");
console.log("   ✓ Finance fields scrubbed (RBAC preserved — no regression)");

// Manager stock scrubber
console.log("D. MANAGER scrubber (fixed) correctness:");
assert(!("quantity" in mgrOut), "MANAGER quantity key should be stripped from stock row");
assert(
  String(transferItems?.[0]?.quantity) === "5",
  `MANAGER TransferItem quantity preserved (got: ${JSON.stringify(transferItems?.[0])})`
);
console.log("   ✓ MANAGER stock-qty scrub works, Decimal not mangled, Transfer operational qty preserved");

// NaN reproduction of EXACT symptoms from user screenshot
console.log("E. UI symptom reproduction (matches user screenshots 0 сомони / NaN поз.):");
// EXACT chain as in UI (history-client.tsx L293 + utils.ts formatMoney L8-L17):
//   Step 1 (UI): formatMoney(Number(sale.total))
//   Step 2 (formatMoney): n = typeof arg string ? parseFloat : arg ; Number(n || 0).toLocaleString
function simulateUiFormatMoney(uiArg: unknown): number {
  // Step 1: history-client L293 wraps in Number()
  const fromUi = Number(uiArg as number);
  // Step 2: formatMoney internal fallback
  const uiN = typeof fromUi === "string" ? parseFloat(fromUi) : fromUi;
  return Number(uiN || 0);
}
const shownMoneyNumericAfterFallback = simulateUiFormatMoney(oldTotalVal);
const shownPositions = (() => {
  // replicate L281 history-client.tsx: reduce Number(it.quantity) over corrupted items
  const items = (oldOut as any).items;
  const n = items.reduce((acc: number, it: any) => acc + Number(it.quantity), 0);
  return n;
})();
console.log(`   OLD method → UI-chain final numeric money: ${shownMoneyNumericAfterFallback} (shows as "0 сомони" in UI)`);
console.log(`   OLD method → positions sum: ${shownPositions} (shows as "NaN поз." in UI)`);
assert(shownMoneyNumericAfterFallback === 0, "OLD UI-formatMoney chain should yield 0 (reproduces '0 сомони')");
assert(Number.isNaN(shownPositions), "OLD positions reduce should be NaN (reproduces 'NaN поз.')");
console.log("   ✓ EXACT screenshot symptoms reproduced (root cause = OLD Decimal detection)");

console.log("\n✅ All assertions passed — fix is correct and regression-safe.\n");
