/**
 * Full RU/TJ i18n audit:
 * 1) Key parity between ru.json and tj.json
 * 2) ACTION_KEYS / ENTITY_KEYS / ROLE_KEYS resolve in both locales
 * 3) Activity actions used in code exist in ACTION_KEYS
 * 4) Heuristic scan for likely hardcoded Cyrillic UI strings outside messages
 *
 * Run: npx tsx scripts/zt-i18n-audit.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ACTION_KEYS,
  ENTITY_KEYS,
  ROLE_KEYS,
  STORE_STATUS_KEYS,
  SALE_STATUS_KEYS,
  DECISION_STATUS_KEYS,
  EXPENSE_PERIODICITY_KEYS,
} from "../src/lib/i18n/labels";

const root = path.resolve(__dirname, "..");

function flatten(
  obj: Record<string, unknown>,
  prefix = ""
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    } else {
      out[key] = String(v ?? "");
    }
  }
  return out;
}

function walkFiles(dir: string, exts: Set<string>, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (
      name === "node_modules" ||
      name === ".next" ||
      name === "tmp" ||
      name === "dist"
    ) {
      continue;
    }
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkFiles(full, exts, out);
    else if (exts.has(path.extname(name))) out.push(full);
  }
  return out;
}

function sectionOf(key: string): string {
  const i = key.indexOf(".");
  return i === -1 ? key : key.slice(0, i);
}

async function main() {
  console.log("=== ZT i18n audit (RU/TJ) ===\n");

  const ru = JSON.parse(
    fs.readFileSync(path.join(root, "src/messages/ru.json"), "utf8")
  ) as Record<string, unknown>;
  const tj = JSON.parse(
    fs.readFileSync(path.join(root, "src/messages/tj.json"), "utf8")
  ) as Record<string, unknown>;

  const ruFlat = flatten(ru);
  const tjFlat = flatten(tj);
  const ruKeys = new Set(Object.keys(ruFlat));
  const tjKeys = new Set(Object.keys(tjFlat));

  const missingInTj = [...ruKeys].filter((k) => !tjKeys.has(k)).sort();
  const missingInRu = [...tjKeys].filter((k) => !ruKeys.has(k)).sort();
  const shared = [...ruKeys].filter((k) => tjKeys.has(k));

  const emptyRu = shared.filter((k) => !String(ruFlat[k]).trim());
  const emptyTj = shared.filter((k) => !String(tjFlat[k]).trim());

  const bySection = (keys: string[]) => {
    const m = new Map<string, number>();
    for (const k of keys) {
      const s = sectionOf(k);
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
  };

  // Label maps must resolve
  const labelMaps: Array<[string, Record<string, string>]> = [
    ["ACTION_KEYS", ACTION_KEYS],
    ["ENTITY_KEYS", ENTITY_KEYS],
    ["ROLE_KEYS", ROLE_KEYS as unknown as Record<string, string>],
    ["STORE_STATUS_KEYS", STORE_STATUS_KEYS as unknown as Record<string, string>],
    ["SALE_STATUS_KEYS", SALE_STATUS_KEYS],
    ["DECISION_STATUS_KEYS", DECISION_STATUS_KEYS],
    ["EXPENSE_PERIODICITY_KEYS", EXPENSE_PERIODICITY_KEYS],
  ];

  const unresolvedRu: string[] = [];
  const unresolvedTj: string[] = [];
  for (const [, map] of labelMaps) {
    for (const msgKey of Object.values(map)) {
      if (!(msgKey in ruFlat)) unresolvedRu.push(msgKey);
      if (!(msgKey in tjFlat)) unresolvedTj.push(msgKey);
    }
  }

  // Activity actions written in code
  const srcFiles = walkFiles(path.join(root, "src"), new Set([".ts", ".tsx"]));
  const actionRe = /action:\s*["']([A-Z][A-Z0-9_]+)["']/g;
  const usedActions = new Set<string>();
  for (const file of srcFiles) {
    const text = fs.readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    while ((m = actionRe.exec(text))) {
      // Skip non-activity enums like APPROVE/CANCEL/COMPLETE on UI
      if (
        m[1] === "APPROVE" ||
        m[1] === "REJECT" ||
        m[1] === "CANCEL" ||
        m[1] === "COMPLETE"
      ) {
        continue;
      }
      usedActions.add(m[1]);
    }
  }
  const actionsMissingMap = [...usedActions]
    .filter((a) => !ACTION_KEYS[a])
    .sort();

  // Heuristic: Cyrillic UI literals in TSX (likely hardcoded)
  const cyrillicLiteralRe =
    /(?<![\w$])(["'`])([^"'`\n]*[А-Яа-яЁёҶҷҲҳҚқӮӯҒғӢӣЇїІіЄє][^"'`\n]*)\1/g;
  const hardcodedHits: Array<{ file: string; sample: string }> = [];
  const skipPathParts = [
    `${path.sep}messages${path.sep}`,
    `${path.sep}scripts${path.sep}`,
  ];
  for (const file of srcFiles) {
    if (skipPathParts.some((p) => file.includes(p))) continue;
    if (!file.endsWith(".tsx") && !file.endsWith(".ts")) continue;
    // Focus UI surfaces
    if (
      !file.includes(`${path.sep}app${path.sep}`) &&
      !file.includes(`${path.sep}components${path.sep}`)
    ) {
      continue;
    }
    const text = fs.readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    const rel = path.relative(root, file);
    while ((m = cyrillicLiteralRe.exec(text))) {
      const sample = m[2].trim();
      if (sample.length < 2) continue;
      // Skip import paths / comments noise already filtered by quotes
      if (/^https?:\/\//.test(sample)) continue;
      hardcodedHits.push({ file: rel, sample: sample.slice(0, 80) });
      if (hardcodedHits.length > 200) break;
    }
    if (hardcodedHits.length > 200) break;
  }

  // Deduplicate hardcoded by file+sample
  const hardUnique = [
    ...new Map(
      hardcodedHits.map((h) => [`${h.file}::${h.sample}`, h])
    ).values(),
  ];

  const report = {
    totals: {
      ruKeys: ruKeys.size,
      tjKeys: tjKeys.size,
      shared: shared.length,
      missingInTj: missingInTj.length,
      missingInRu: missingInRu.length,
      emptyRu: emptyRu.length,
      emptyTj: emptyTj.length,
      activityActionsInCode: usedActions.size,
      actionsMissingFromACTION_KEYS: actionsMissingMap.length,
      unresolvedLabelKeysRu: unresolvedRu.length,
      unresolvedLabelKeysTj: unresolvedTj.length,
      hardcodedCyrillicSamples: hardUnique.length,
    },
    missingInTjBySection: bySection(missingInTj),
    missingInRuBySection: bySection(missingInRu),
    missingInTj: missingInTj.slice(0, 80),
    missingInRu: missingInRu.slice(0, 80),
    unresolvedRu,
    unresolvedTj,
    actionsMissingMap,
    hardcodedCyrillicSamples: hardUnique.slice(0, 60),
  };

  const outDir = path.join(root, "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "i18n-audit-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("Totals:", report.totals);
  if (missingInTj.length) {
    console.log("\nMissing in TJ (first 40):", missingInTj.slice(0, 40));
  }
  if (missingInRu.length) {
    console.log("\nMissing in RU (first 40):", missingInRu.slice(0, 40));
  }
  if (actionsMissingMap.length) {
    console.log("\nActions without ACTION_KEYS:", actionsMissingMap);
  }
  if (unresolvedRu.length || unresolvedTj.length) {
    console.log("\nUnresolved label message keys RU:", unresolvedRu);
    console.log("Unresolved label message keys TJ:", unresolvedTj);
  }
  console.log(`\nFull report: ${outPath}`);

  assert.equal(
    unresolvedRu.length,
    0,
    `Label maps missing RU translations: ${unresolvedRu.join(", ")}`
  );
  assert.equal(
    unresolvedTj.length,
    0,
    `Label maps missing TJ translations: ${unresolvedTj.join(", ")}`
  );
  assert.equal(
    actionsMissingMap.length,
    0,
    `Activity actions missing from ACTION_KEYS: ${actionsMissingMap.join(", ")}`
  );
  assert.equal(
    missingInTj.length,
    0,
    `RU keys missing in TJ: ${missingInTj.length}`
  );
  assert.equal(
    missingInRu.length,
    0,
    `TJ keys missing in RU: ${missingInRu.length}`
  );

  console.log("\nPASS — RU/TJ key parity + activity labels complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
