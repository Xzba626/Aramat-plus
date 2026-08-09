import {
  NEVER_GRANTABLE_SET,
  DEFAULT_MANAGER_GRANTS,
  GRANTABLE_KEY_SET,
} from "../src/lib/permissions/keys";
import { stripExactStockForManager } from "../src/lib/permissions/manager-response";

const overlap = [...NEVER_GRANTABLE_SET].filter((k) => GRANTABLE_KEY_SET.has(k));
console.log("never∩grantable", overlap.length === 0 ? "PASS" : overlap);

console.log(
  "sales.create default OFF",
  !(DEFAULT_MANAGER_GRANTS as readonly string[]).includes("sales.create")
    ? "PASS"
    : "FAIL"
);
console.log(
  "sales.view default OFF",
  !(DEFAULT_MANAGER_GRANTS as readonly string[]).includes("sales.view")
    ? "PASS"
    : "FAIL"
);

const cleaned: Record<string, boolean> = {};
for (const [key, enabled] of Object.entries({
  "finance.view": true,
  "sales.create": true,
  bogus: true,
})) {
  if (NEVER_GRANTABLE_SET.has(key)) continue;
  if (!GRANTABLE_KEY_SET.has(key)) continue;
  cleaned[key] = enabled;
}
console.log("PUT clean", JSON.stringify(cleaned));

const out = stripExactStockForManager(
  { role: "MANAGER" },
  {
    unitsTotal: 12,
    warehouseQty: 5,
    storeQtys: [{ qty: 3 }],
    stock: { quantity: 7, minStock: 1 },
    items: [{ transferId: "t", productId: "p", quantity: 2 }],
  }
) as Record<string, unknown>;
console.log(
  "scrub",
  out.unitsTotal === undefined &&
    out.warehouseQty === undefined &&
    out.storeQtys === undefined &&
    (out.stock as { quantity?: number }).quantity === undefined &&
    (out.items as { quantity: number }[])[0].quantity === 2
    ? "PASS"
    : "FAIL",
  JSON.stringify(out)
);
