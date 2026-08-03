/**
 * Wave F — Commercial localization certification (RU + TJ).
 * Run: npx tsx scripts/zt-localization-cert.ts
 *
 * Exit 0 only when all hard gates pass.
 * Soft findings (heuristic hardcoded strings) are reported for manual review.
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
  ACTION_COMMENT_KEYS,
} from "../src/lib/i18n/labels";

const root = path.resolve(__dirname, "..");

type Finding = {
  severity: "FAIL" | "WARN";
  area: string;
  message: string;
  sample?: string;
};

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
      name === "dist" ||
      name === "scripts"
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

function rel(p: string) {
  return path.relative(root, p).replace(/\\/g, "/");
}

/** Extract t("a.b") / t('a.b') / t(`a.b`) static keys from source. */
function extractTKeys(source: string): string[] {
  const keys: string[] = [];
  const re = /\bt\(\s*["'`]([a-zA-Z0-9_.]+)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) keys.push(m[1]);
  return keys;
}

function extractLabelKeyLiterals(source: string): string[] {
  const keys: string[] = [];
  // "dashboard.foo" style string literals that look like i18n keys
  const re = /["'`]([a-z][a-zA-Z0-9]*\.[a-zA-Z0-9_.]+)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const k = m[1];
    // skip imports / URLs / css-ish
    if (k.includes("/") || k.startsWith("http")) continue;
    if (k.split(".").length < 2) continue;
    keys.push(k);
  }
  return keys;
}

async function main() {
  console.log("=== Wave F — Localization commercial certification ===\n");
  const findings: Finding[] = [];

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
  for (const k of missingInTj) {
    findings.push({
      severity: "FAIL",
      area: "dict-parity",
      message: `RU key missing in TJ: ${k}`,
    });
  }
  for (const k of missingInRu) {
    findings.push({
      severity: "FAIL",
      area: "dict-parity",
      message: `TJ key missing in RU: ${k}`,
    });
  }

  const emptyRu = [...ruKeys].filter((k) => !String(ruFlat[k]).trim());
  const emptyTj = [...tjKeys].filter((k) => !String(tjFlat[k]).trim());
  for (const k of emptyRu) {
    findings.push({
      severity: "FAIL",
      area: "dict-empty",
      message: `Empty RU value: ${k}`,
    });
  }
  for (const k of emptyTj) {
    findings.push({
      severity: "FAIL",
      area: "dict-empty",
      message: `Empty TJ value: ${k}`,
    });
  }

  // Identical RU/TJ values for UI sections (likely untranslated TJ)
  const identicalSuspect: string[] = [];
  const skipIdenticalPrefixes = [
    "units.",
    "common.currency",
    "common.somoni",
  ];
  for (const k of ruKeys) {
    if (!tjKeys.has(k)) continue;
    if (skipIdenticalPrefixes.some((p) => k.startsWith(p))) continue;
    const rv = ruFlat[k].trim();
    const tv = tjFlat[k].trim();
    if (!rv || rv !== tv) continue;
    // Only flag if contains Cyrillic letters (likely Russian left in TJ)
    if (/[А-Яа-яЁё]/.test(rv) && rv.length >= 3) {
      identicalSuspect.push(k);
    }
  }
  for (const k of identicalSuspect) {
    findings.push({
      severity: "FAIL",
      area: "tj-untranslated",
      message: `TJ copy identical to RU (likely untranslated): ${k}`,
      sample: ruFlat[k],
    });
  }

  // Label maps must resolve
  const labelMaps: Array<[string, Record<string, string>]> = [
    ["ACTION_KEYS", ACTION_KEYS],
    ["ENTITY_KEYS", ENTITY_KEYS],
    ["ROLE_KEYS", ROLE_KEYS as unknown as Record<string, string>],
    ["STORE_STATUS_KEYS", STORE_STATUS_KEYS as unknown as Record<string, string>],
    ["SALE_STATUS_KEYS", SALE_STATUS_KEYS],
    ["DECISION_STATUS_KEYS", DECISION_STATUS_KEYS],
    ["EXPENSE_PERIODICITY_KEYS", EXPENSE_PERIODICITY_KEYS],
    ["ACTION_COMMENT_KEYS", ACTION_COMMENT_KEYS],
  ];
  for (const [name, map] of labelMaps) {
    for (const [code, msgKey] of Object.entries(map)) {
      if (!(msgKey in ruFlat)) {
        findings.push({
          severity: "FAIL",
          area: "label-maps",
          message: `${name}.${code} → missing RU ${msgKey}`,
        });
      }
      if (!(msgKey in tjFlat)) {
        findings.push({
          severity: "FAIL",
          area: "label-maps",
          message: `${name}.${code} → missing TJ ${msgKey}`,
        });
      }
    }
  }

  const srcFiles = walkFiles(path.join(root, "src"), new Set([".ts", ".tsx"]));

  // Activity actions in code
  const actionRe = /action:\s*["']([A-Z][A-Z0-9_]+)["']/g;
  const usedActions = new Set<string>();
  for (const file of srcFiles) {
    const text = fs.readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    while ((m = actionRe.exec(text))) {
      if (["APPROVE", "REJECT", "CANCEL", "COMPLETE", "SUBMIT"].includes(m[1]))
        continue;
      usedActions.add(m[1]);
    }
  }
  for (const a of [...usedActions].sort()) {
    if (!ACTION_KEYS[a]) {
      findings.push({
        severity: "FAIL",
        area: "activity-actions",
        message: `Activity action missing ACTION_KEYS: ${a}`,
      });
    }
  }

  // t("...") keys referenced in UI must exist in both dicts
  const referenced = new Set<string>();
  for (const file of srcFiles) {
    if (!file.includes(`${path.sep}app${path.sep}`) && !file.includes(`${path.sep}components${path.sep}`) && !file.includes(`${path.sep}lib${path.sep}i18n${path.sep}`) && !file.includes(`${path.sep}lib${path.sep}navigation${path.sep}`) && !file.includes(`${path.sep}lib${path.sep}export${path.sep}`)) {
      continue;
    }
    const text = fs.readFileSync(file, "utf8");
    for (const k of extractTKeys(text)) referenced.add(k);
    // labelKey: "dashboard.foo"
    for (const k of text.matchAll(/labelKey:\s*["'`]([a-zA-Z0-9_.]+)["'`]/g)) {
      referenced.add(k[1]);
    }
    for (const k of text.matchAll(/titleKey:\s*["'`]([a-zA-Z0-9_.]+)["'`]/g)) {
      referenced.add(k[1]);
    }
  }
  // Also ACTION_KEYS values etc already checked

  const missingRefRu: string[] = [];
  const missingRefTj: string[] = [];
  for (const k of [...referenced].sort()) {
    // Dynamic namespaces sometimes use bare section — skip single-segment
    if (!k.includes(".")) continue;
    if (!(k in ruFlat)) missingRefRu.push(k);
    if (!(k in tjFlat)) missingRefTj.push(k);
  }
  for (const k of missingRefRu) {
    findings.push({
      severity: "FAIL",
      area: "missing-keys",
      message: `Code references missing RU key: ${k}`,
    });
  }
  for (const k of missingRefTj) {
    findings.push({
      severity: "FAIL",
      area: "missing-keys",
      message: `Code references missing TJ key: ${k}`,
    });
  }

  // Hardcoded Cyrillic / English UI in TSX (user-visible risk)
  const cyrillicLiteralRe =
    /(?<![\w$])(["'`])([^"'`\n]{0,120}[А-Яа-яЁёҶҷҲҳҚқӮӯҒғӢӣ][^"'`\n]{0,120})\1/g;
  const englishUiRe =
    /(?<![\w$])(["'`])((?:Save|Cancel|Delete|Submit|Loading|Error|Success|Confirm|Close|Back|Next|Search|Filter|Export|Import|Settings|Dashboard|Warehouse|Products|Reports|Notifications|Password|Email|Login|Logout|Owner|Manager|Seller|Today|Week|Month|Year|Approve|Reject)[^"'`\n]{0,40})\1/g;

  const hardcoded: Array<{ file: string; sample: string; kind: string }> = [];
  const allowHardcode = [
    // comments / technical
    /eslint/,
    /TODO/,
    /FIXME/,
  ];

  for (const file of srcFiles) {
    if (
      !file.includes(`${path.sep}app${path.sep}`) &&
      !file.includes(`${path.sep}components${path.sep}`)
    ) {
      continue;
    }
    if (file.includes(`${path.sep}messages${path.sep}`)) continue;
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*"))
        continue;
      // skip import lines
      if (trimmed.startsWith("import ")) continue;

      for (const re of [cyrillicLiteralRe, englishUiRe]) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line))) {
          const sample = m[2].trim();
          if (sample.length < 2) continue;
          if (allowHardcode.some((r) => r.test(sample))) continue;
          // likely template with only unit
          hardcoded.push({
            file: rel(file),
            sample: sample.slice(0, 100),
            kind: re === cyrillicLiteralRe ? "cyrillic" : "english-ui",
          });
        }
      }
    }
  }

  // Deduplicate
  const hardUnique = [
    ...new Map(hardcoded.map((h) => [`${h.file}::${h.sample}`, h])).values(),
  ];
  for (const h of hardUnique) {
    findings.push({
      severity: "WARN",
      area: "hardcoded-ui",
      message: `${h.kind} literal in ${h.file}`,
      sample: h.sample,
    });
  }

  // Raw throw Error("CODE") must be in api safe list OR only used server-side — check common raw display risk:
  // JSX that renders {error} without apiErrorMessage is hard to detect; flag pages that setError(data.error) without wrapper
  const rawErrorSet = new Set<string>();
  for (const file of srcFiles) {
    if (!file.endsWith(".tsx")) continue;
    const text = fs.readFileSync(file, "utf8");
    if (
      /setError\(\s*(?:data|json|resJson|payload)\.error\s*\)/.test(text) &&
      !/apiErrorMessage/.test(text)
    ) {
      rawErrorSet.add(rel(file));
    }
  }
  for (const f of [...rawErrorSet].sort()) {
    findings.push({
      severity: "FAIL",
      area: "raw-api-error",
      message: `Sets error from API without apiErrorMessage: ${f}`,
    });
  }

  // Section scoreboard (static structure coverage based on routes + findings)
  const sections = [
    "Dashboard",
    "Warehouse",
    "Products",
    "Sales",
    "Returns",
    "Inventory",
    "Bottle Management",
    "Reports",
    "Settings",
    "Notifications",
    "Revision",
    "Discounts",
    "Journal",
    "Localization (RU)",
    "Localization (TJ)",
    "Owner",
    "Manager",
    "Seller",
  ] as const;

  const fails = findings.filter((f) => f.severity === "FAIL");
  const warns = findings.filter((f) => f.severity === "WARN");

  const scoreboard: Record<string, "PASS" | "PARTIAL" | "FAIL"> = {};
  for (const s of sections) {
    scoreboard[s] = fails.length === 0 ? (warns.length === 0 ? "PASS" : "PARTIAL") : "FAIL";
  }
  // Refine: if only soft warns about hardcoded, Localization can be PARTIAL until fixed
  if (fails.length === 0 && warns.length > 0) {
    for (const s of sections) scoreboard[s] = "PARTIAL";
    scoreboard["Localization (RU)"] = "PARTIAL";
    scoreboard["Localization (TJ)"] = "PARTIAL";
  }
  if (fails.length === 0 && warns.length === 0) {
    for (const s of sections) scoreboard[s] = "PASS";
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      ruKeys: ruKeys.size,
      tjKeys: tjKeys.size,
      referencedKeys: referenced.size,
      activityActions: usedActions.size,
      failFindings: fails.length,
      warnFindings: warns.length,
      identicalRuTjSuspect: identicalSuspect.length,
      hardcodedUiSamples: hardUnique.length,
      rawApiErrorFiles: rawErrorSet.size,
    },
    scoreboard,
    fails: fails.slice(0, 200),
    warns: warns.slice(0, 200),
    identicalSuspect: identicalSuspect.slice(0, 100),
    hardcodedUi: hardUnique.slice(0, 100),
  };

  const outDir = path.join(root, "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "wave-f-localization-cert.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("Totals:", report.totals);
  console.log("\nScoreboard:");
  for (const [k, v] of Object.entries(scoreboard)) {
    console.log(`  ${k} — ${v}`);
  }
  if (fails.length) {
    console.log("\nFAIL findings (first 40):");
    for (const f of fails.slice(0, 40)) {
      console.log(`  [${f.area}] ${f.message}${f.sample ? ` :: ${f.sample}` : ""}`);
    }
  }
  if (warns.length) {
    console.log(`\nWARN findings: ${warns.length} (see report)`);
  }
  console.log(`\nFull report: ${outPath}`);

  assert.equal(missingInTj.length, 0, "RU/TJ key parity");
  assert.equal(missingInRu.length, 0, "TJ/RU key parity");
  assert.equal(emptyRu.length, 0, "no empty RU");
  assert.equal(emptyTj.length, 0, "no empty TJ");
  assert.equal(
    fails.filter((f) => f.area === "label-maps" || f.area === "activity-actions" || f.area === "missing-keys" || f.area === "raw-api-error" || f.area === "tj-untranslated").length,
    0,
    "hard localization gates"
  );

  if (fails.length > 0) {
    console.error("\nCERTIFICATION: FAIL");
    process.exit(1);
  }
  if (warns.length > 0) {
    console.log("\nCERTIFICATION: PARTIAL (hard gates pass; soft UI literal warnings remain)");
    process.exit(2);
  }
  console.log("\nCERTIFICATION: PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
