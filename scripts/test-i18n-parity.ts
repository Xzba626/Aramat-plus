/**
 * ru.json ↔ tj.json key parity (critical namespaces only).
 * Run: npx tsx scripts/test-i18n-parity.ts
 */
import assert from "node:assert/strict";
import ru from "../src/messages/ru.json";
import tj from "../src/messages/tj.json";

type Dict = Record<string, unknown>;

const CRITICAL_PREFIXES = [
  "common.",
  "errors.",
  "storeDetail.",
  "pos.",
  "saleStatus.",
];

function flattenKeys(obj: Dict, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...flattenKeys(v as Dict, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

function filterCritical(keys: string[]): string[] {
  return keys.filter((k) =>
    CRITICAL_PREFIXES.some((p) => k === p.slice(0, -1) || k.startsWith(p))
  );
}

function getVal(obj: Dict, path: string): unknown {
  let cur: unknown = obj;
  for (const p of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Dict)[p];
  }
  return cur;
}

function main() {
  console.log("=== i18n ru/tj parity (critical) ===\n");
  const ruKeys = filterCritical(flattenKeys(ru as Dict));
  const tjKeys = filterCritical(flattenKeys(tj as Dict));
  const ruSet = new Set(ruKeys);
  const tjSet = new Set(tjKeys);

  const missingInTj = ruKeys.filter((k) => !tjSet.has(k));
  const missingInRu = tjKeys.filter((k) => !ruSet.has(k));

  assert.equal(missingInTj.length, 0, `tj missing: ${missingInTj.slice(0, 10).join(", ")}`);
  assert.equal(missingInRu.length, 0, `ru missing: ${missingInRu.slice(0, 10).join(", ")}`);

  for (const k of ruKeys) {
    const rv = getVal(ru as Dict, k);
    const tv = getVal(tj as Dict, k);
    assert.equal(typeof rv, "string", `ru ${k} not string`);
    assert.equal(typeof tv, "string", `tj ${k} not string`);
    assert.notEqual(rv, k, `ru raw key ${k}`);
    assert.notEqual(tv, k, `tj raw key ${k}`);
  }

  console.log(`✓ ${ruKeys.length} critical keys parity ru/tj`);
  console.log("\n✓ i18n parity passed");
}

main();
