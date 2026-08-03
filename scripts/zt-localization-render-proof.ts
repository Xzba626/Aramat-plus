/**
 * Wave F — dictionary render proof: every UI key resolves for RU and TJ
 * without falling back to the raw key string.
 * Run: npx tsx scripts/zt-localization-render-proof.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { translate } from "../src/lib/i18n/translate";
import ru from "../src/messages/ru.json";
import tj from "../src/messages/tj.json";
import {
  ACTION_KEYS,
  labelAction,
  labelActionComment,
  labelActivityActor,
  labelEntity,
  labelRole,
  labelSaleStatus,
  labelStoreStatus,
  labelDecisionStatus,
  labelRevisionStatus,
} from "../src/lib/i18n/labels";

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

function tFactory(locale: "ru" | "tj") {
  const dict = (locale === "tj" ? tj : ru) as Record<string, unknown>;
  const fallback = ru as Record<string, unknown>;
  return (key: string, params?: Record<string, string | number>) =>
    translate(dict, fallback, key, params);
}

async function main() {
  const ruFlat = flatten(ru as Record<string, unknown>);
  const tjFlat = flatten(tj as Record<string, unknown>);
  const tRu = tFactory("ru");
  const tTj = tFactory("tj");

  // Every key must not render as itself
  for (const k of Object.keys(ruFlat)) {
    const r = tRu(k);
    const j = tTj(k);
    assert.notEqual(r, k, `RU render falls back to key ${k}`);
    assert.notEqual(j, k, `TJ render falls back to key ${k}`);
    assert.ok(String(r).trim(), `empty RU ${k}`);
    assert.ok(String(j).trim(), `empty TJ ${k}`);
  }

  // Critical label helpers
  for (const action of Object.keys(ACTION_KEYS)) {
    const r = labelAction(action, tRu);
    const j = labelAction(action, tTj);
    assert.notEqual(r, action, `RU action raw ${action}`);
    assert.notEqual(j, action, `TJ action raw ${action}`);
  }

  assert.equal(labelActionComment("bad_password", tRu), "Неверный пароль");
  assert.ok(labelActionComment("bad_password", tTj));
  assert.notEqual(labelActionComment("bad_password", tTj), "bad_password");

  const actorRu = labelActivityActor(
    { action: "LOGIN_FAIL", email: "owner@aromat.plus", userName: "Nasuh", role: "OWNER" },
    tRu
  );
  assert.match(actorRu, /owner@aromat\.plus/);
  assert.ok(!actorRu.includes("Владелец · Владелец"));

  assert.equal(labelRole("OWNER", tRu), tRu("roles.owner"));
  assert.equal(labelRole("OWNER", tTj), tTj("roles.owner"));
  assert.notEqual(labelRole("OWNER", tRu), labelRole("OWNER", tTj));

  for (const st of ["ACTIVE", "CLOSED", "INVENTORY", "ARCHIVED"]) {
    assert.notEqual(labelStoreStatus(st, tRu), st);
    assert.notEqual(labelStoreStatus(st, tTj), st);
  }
  for (const st of ["COMPLETED", "RETURNED", "CANCELLED", "PENDING"]) {
    assert.notEqual(labelSaleStatus(st, tRu), st);
    assert.notEqual(labelSaleStatus(st, tTj), st);
  }
  for (const st of ["PENDING", "APPROVED", "REJECTED"]) {
    assert.notEqual(labelDecisionStatus(st, tRu), st);
    assert.notEqual(labelDecisionStatus(st, tTj), st);
  }
  for (const st of [
    "IN_PROGRESS",
    "PENDING_APPROVAL",
    "COMPLETED",
    "CANCELLED",
  ]) {
    assert.notEqual(labelRevisionStatus(st, tRu), st);
    assert.notEqual(labelRevisionStatus(st, tTj), st);
  }

  assert.notEqual(labelEntity("InventorySession", tRu), "InventorySession");
  assert.notEqual(labelEntity("InventorySession", tTj), "InventorySession");

  // Locale switch integrity: sample of high-traffic keys differ across locales
  const sample = [
    "dashboard.decisionFeed",
    "nav.inventoryRevision",
    "reportsPage.title",
    "revisionPage.complete",
    "wipe.title",
    "pos.sell",
  ];
  for (const k of sample) {
    assert.notEqual(tRu(k), tTj(k), `locale switch identical for ${k}`);
  }

  const out = {
    ruKeys: Object.keys(ruFlat).length,
    tjKeys: Object.keys(tjFlat).length,
    actionsCovered: Object.keys(ACTION_KEYS).length,
    status: "PASS",
  };
  fs.mkdirSync(path.join(process.cwd(), "tmp"), { recursive: true });
  fs.writeFileSync(
    path.join(process.cwd(), "tmp", "wave-f-render-proof.json"),
    JSON.stringify(out, null, 2)
  );
  console.log("PASS render proof", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
