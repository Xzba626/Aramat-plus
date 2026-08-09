/**
 * M2 runtime HTTP matrix — sellers.create / sellers.assign + scope.
 *
 * Prereq: migrate deployed, app on ZT_BASE_URL (default http://127.0.0.1:3000)
 *
 *   npx tsx scripts/m2-runtime-http.mts
 *
 * Env (optional):
 *   ZT_BASE_URL, M2_OWNER_EMAIL, M2_OWNER_PASSWORD,
 *   M2_MANAGER_EMAIL, M2_MANAGER_PASSWORD,
 *   M2_SELLER_EMAIL, M2_SELLER_PASSWORD
 */
import { MANAGER_PERMISSION_KEYS, DEFAULT_MANAGER_GRANTS } from "../src/lib/permissions/keys";

const BASE = process.env.ZT_BASE_URL || "http://127.0.0.1:3000";
const OWNER_EMAIL = process.env.M2_OWNER_EMAIL || "owner@aromat.plus";
const OWNER_PASSWORD = process.env.M2_OWNER_PASSWORD || "owner1234";
const MANAGER_EMAIL = process.env.M2_MANAGER_EMAIL || "manager@aromat.plus";
const MANAGER_PASSWORD =
  process.env.M2_MANAGER_PASSWORD || "manager12345";
const SELLER_EMAIL = process.env.M2_SELLER_EMAIL || "seller@aromat.plus";
const SELLER_PASSWORD = process.env.M2_SELLER_PASSWORD || "seller12345";

type Row = { id: number; name: string; ok: boolean; detail: string };

const results: Row[] = [];

function record(id: number, name: string, ok: boolean, detail: string) {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} #${id} ${name} — ${detail}`);
}

async function login(email: string, password: string) {
  const jar = new Map<string, string>();
  const absorb = (headers: Headers) => {
    const list =
      typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
    for (const raw of list) {
      const part = raw.split(";")[0];
      const eq = part.indexOf("=");
      if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
    }
  };
  const cookieHeader = () =>
    [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  if (!csrfRes.ok) {
    throw new Error(`csrf ${csrfRes.status} — is the app running at ${BASE}?`);
  }
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  absorb(csrfRes.headers);

  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(),
      Origin: BASE,
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: `${BASE}/dashboard`,
      json: "true",
    }),
    redirect: "manual",
  });
  absorb(res.headers);
  const cookie = cookieHeader();
  if (![...jar.keys()].some((k) => /session/i.test(k))) {
    throw new Error(`login failed for ${email} status=${res.status}`);
  }
  return cookie;
}

async function api(cookie: string, path: string, init?: RequestInit) {
  const headers: Record<string, string> = {
    Cookie: cookie,
    Origin: BASE,
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
  };
  const extra = init?.headers;
  if (extra && typeof extra === "object" && !(extra instanceof Headers)) {
    Object.assign(headers, extra as Record<string, string>);
  }
  return fetch(`${BASE}${path}`, {
    ...init,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
}

function basePerms(overrides: Record<string, boolean> = {}) {
  const permissions: Record<string, boolean> = {};
  for (const k of MANAGER_PERMISSION_KEYS) {
    permissions[k] = (DEFAULT_MANAGER_GRANTS as readonly string[]).includes(k);
  }
  permissions["sellers.create"] = false;
  permissions["sellers.assign"] = false;
  permissions["sellers.view"] = false;
  Object.assign(permissions, overrides);
  return permissions;
}

async function putManagerPerms(
  ownerCookie: string,
  managerId: string,
  body: {
    scopeMode: string;
    storeIds: string[];
    permissions: Record<string, boolean>;
  }
) {
  const res = await api(ownerCookie, `/api/managers/${managerId}/permissions`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`PUT permissions ${res.status} ${t.slice(0, 200)}`);
  }
  return res.json();
}

function uniqEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@m2test.local`;
}

async function main() {
  console.log(`M2 runtime @ ${BASE}`);

  let ownerCookie: string;
  let managerCookie: string;
  let sellerCookie: string;
  try {
    ownerCookie = await login(OWNER_EMAIL, OWNER_PASSWORD);
    managerCookie = await login(MANAGER_EMAIL, MANAGER_PASSWORD);
    sellerCookie = await login(SELLER_EMAIL, SELLER_PASSWORD);
  } catch (e) {
    console.error(String(e));
    console.error(
      "BLOCKER: login failed. Start app + migrate, check seed passwords."
    );
    process.exit(2);
  }

  const usersRes = await api(ownerCookie, "/api/users");
  if (!usersRes.ok) {
    console.error("BLOCKER: OWNER GET /api/users failed", usersRes.status);
    process.exit(2);
  }
  const users = (await usersRes.json()) as Array<{
    id: string;
    email: string;
    role: string;
    storeId?: string | null;
  }>;
  const manager = users.find(
    (u) => u.email.toLowerCase() === MANAGER_EMAIL.toLowerCase()
  );
  if (!manager) {
    console.error("BLOCKER: manager user not found");
    process.exit(2);
  }

  const storesRes = await api(ownerCookie, "/api/stores");
  if (!storesRes.ok) {
    console.error("BLOCKER: OWNER GET /api/stores failed", storesRes.status);
    process.exit(2);
  }
  const stores = (
    (await storesRes.json()) as Array<{
      id: string;
      name: string;
      kind?: string;
    }>
  ).filter((s) => s.kind !== "OWNER_DIRECT");

  if (stores.length < 2) {
    console.error(
      `BLOCKER: need ≥2 BRANCH stores for scope tests (have ${stores.length})`
    );
    process.exit(2);
  }

  const storeA = stores[0]!;
  const storeB = stores[1]!;
  const legacyStoreId = manager.storeId && stores.some((s) => s.id === manager.storeId)
    ? manager.storeId
    : storeA.id;

  // --- #1 create OFF ---
  await putManagerPerms(ownerCookie, manager.id, {
    scopeMode: "ALL_STORES",
    storeIds: [],
    permissions: basePerms({ "sellers.create": false, "sellers.assign": false }),
  });
  {
    const res = await api(managerCookie, "/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: "M2 Off Create",
        email: uniqEmail("off"),
        password: "TestPass123!",
        role: "SELLER",
        storeId: storeA.id,
      }),
    });
    record(1, "sellers.create OFF → 403", res.status === 403, `status=${res.status}`);
  }

  // --- #2 create ON ---
  await putManagerPerms(ownerCookie, manager.id, {
    scopeMode: "ALL_STORES",
    storeIds: [],
    permissions: basePerms({ "sellers.create": true, "sellers.assign": true }),
  });
  let createdSellerId: string | null = null;
  {
    const res = await api(managerCookie, "/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: "M2 On Create",
        email: uniqEmail("on"),
        password: "TestPass123!",
        role: "SELLER",
        storeId: storeA.id,
      }),
    });
    const body = res.ok ? await res.json() : null;
    createdSellerId = body?.id ?? null;
    record(
      2,
      "sellers.create ON → create SELLER",
      res.status === 201 && body?.role === "SELLER",
      `status=${res.status} role=${body?.role ?? "?"}`
    );
  }

  // --- #3 out of scope (SELECTED only A, create on B) ---
  await putManagerPerms(ownerCookie, manager.id, {
    scopeMode: "SELECTED_STORES",
    storeIds: [storeA.id],
    permissions: basePerms({ "sellers.create": true, "sellers.assign": true }),
  });
  {
    const res = await api(managerCookie, "/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: "M2 OOS",
        email: uniqEmail("oos"),
        password: "TestPass123!",
        role: "SELLER",
        storeId: storeB.id,
      }),
    });
    record(3, "create store вне scope → 403", res.status === 403, `status=${res.status}`);
  }

  // --- #4 ALL_STORES ---
  await putManagerPerms(ownerCookie, manager.id, {
    scopeMode: "ALL_STORES",
    storeIds: [],
    permissions: basePerms({ "sellers.create": true, "sellers.assign": true }),
  });
  {
    const resA = await api(managerCookie, "/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: "M2 All A",
        email: uniqEmail("alla"),
        password: "TestPass123!",
        role: "SELLER",
        storeId: storeA.id,
      }),
    });
    const resB = await api(managerCookie, "/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: "M2 All B",
        email: uniqEmail("allb"),
        password: "TestPass123!",
        role: "SELLER",
        storeId: storeB.id,
      }),
    });
    record(
      4,
      "ALL_STORES create on A+B",
      resA.status === 201 && resB.status === 201,
      `A=${resA.status} B=${resB.status}`
    );
  }

  // --- #5 SELECTED_STORES ---
  await putManagerPerms(ownerCookie, manager.id, {
    scopeMode: "SELECTED_STORES",
    storeIds: [storeA.id],
    permissions: basePerms({ "sellers.create": true, "sellers.assign": true }),
  });
  {
    const okRes = await api(managerCookie, "/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: "M2 Sel OK",
        email: uniqEmail("selok"),
        password: "TestPass123!",
        role: "SELLER",
        storeId: storeA.id,
      }),
    });
    const badRes = await api(managerCookie, "/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: "M2 Sel BAD",
        email: uniqEmail("selbad"),
        password: "TestPass123!",
        role: "SELLER",
        storeId: storeB.id,
      }),
    });
    record(
      5,
      "SELECTED_STORES only chosen",
      okRes.status === 201 && badRes.status === 403,
      `in=${okRes.status} out=${badRes.status}`
    );
  }

  // --- #6 LEGACY_SINGLE ---
  // Ensure manager.storeId points at legacyStoreId via OWNER PATCH
  {
    const patch = await api(ownerCookie, "/api/users", {
      method: "PATCH",
      body: JSON.stringify({ id: manager.id, storeId: legacyStoreId }),
    });
    if (!patch.ok) {
      record(6, "LEGACY_SINGLE setup", false, `owner patch manager store ${patch.status}`);
    } else {
      await putManagerPerms(ownerCookie, manager.id, {
        scopeMode: "LEGACY_SINGLE",
        storeIds: [],
        permissions: basePerms({ "sellers.create": true, "sellers.assign": true }),
      });
      const other = stores.find((s) => s.id !== legacyStoreId)!;
      const okRes = await api(managerCookie, "/api/users", {
        method: "POST",
        body: JSON.stringify({
          name: "M2 Leg OK",
          email: uniqEmail("legok"),
          password: "TestPass123!",
          role: "SELLER",
          storeId: legacyStoreId,
        }),
      });
      const badRes = await api(managerCookie, "/api/users", {
        method: "POST",
        body: JSON.stringify({
          name: "M2 Leg BAD",
          email: uniqEmail("legbad"),
          password: "TestPass123!",
          role: "SELLER",
          storeId: other.id,
        }),
      });
      record(
        6,
        "LEGACY_SINGLE only storeId",
        okRes.status === 201 && badRes.status === 403,
        `in=${okRes.status} out=${badRes.status} store=${legacyStoreId}`
      );
    }
  }

  // Restore ALL + create+assign for remaining tests
  await putManagerPerms(ownerCookie, manager.id, {
    scopeMode: "ALL_STORES",
    storeIds: [],
    permissions: basePerms({ "sellers.create": true, "sellers.assign": true }),
  });

  // --- #7 create MANAGER ---
  {
    const res = await api(managerCookie, "/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: "Hack Mgr",
        email: uniqEmail("hackmgr"),
        password: "TestPass123!",
        role: "MANAGER",
        storeId: storeA.id,
      }),
    });
    record(7, "cannot create MANAGER", res.status === 403, `status=${res.status}`);
  }

  // --- #8 create OWNER ---
  {
    const res = await api(managerCookie, "/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: "Hack Own",
        email: uniqEmail("hackown"),
        password: "TestPass123!",
        role: "OWNER",
        storeId: storeA.id,
      }),
    });
    // schema may 400 before role check; both deny OK
    record(
      8,
      "cannot create OWNER",
      res.status === 403 || res.status === 400,
      `status=${res.status}`
    );
  }

  // --- #9 assign OFF ---
  await putManagerPerms(ownerCookie, manager.id, {
    scopeMode: "ALL_STORES",
    storeIds: [],
    permissions: basePerms({ "sellers.create": true, "sellers.assign": false }),
  });
  {
    // need a seller id — create via owner
    const created = await api(ownerCookie, "/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: "Assign Target",
        email: uniqEmail("asgtoff"),
        password: "TestPass123!",
        role: "SELLER",
        storeId: null,
      }),
    });
    const target = created.ok ? await created.json() : null;
    const res = await api(managerCookie, `/api/stores/${storeA.id}/staff`, {
      method: "POST",
      body: JSON.stringify({ userId: target?.id ?? "x" }),
    });
    record(9, "sellers.assign OFF → 403", res.status === 403, `status=${res.status}`);
  }

  // --- #10 assign in scope ---
  await putManagerPerms(ownerCookie, manager.id, {
    scopeMode: "SELECTED_STORES",
    storeIds: [storeA.id],
    permissions: basePerms({ "sellers.create": true, "sellers.assign": true }),
  });
  let assignUserId: string | null = null;
  {
    const created = await api(ownerCookie, "/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: "Assign OK",
        email: uniqEmail("asgtok"),
        password: "TestPass123!",
        role: "SELLER",
        storeId: null,
      }),
    });
    const target = created.ok ? await created.json() : null;
    assignUserId = target?.id ?? null;
    const res = await api(managerCookie, `/api/stores/${storeA.id}/staff`, {
      method: "POST",
      body: JSON.stringify({ userId: assignUserId }),
    });
    record(10, "assign в scope → OK", res.ok, `status=${res.status}`);
  }

  // --- #11 assign вне scope ---
  {
    const created = await api(ownerCookie, "/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: "Assign OOS",
        email: uniqEmail("asgtoos"),
        password: "TestPass123!",
        role: "SELLER",
        storeId: null,
      }),
    });
    const target = created.ok ? await created.json() : null;
    const res = await api(managerCookie, `/api/stores/${storeB.id}/staff`, {
      method: "POST",
      body: JSON.stringify({ userId: target?.id }),
    });
    record(11, "assign вне scope → 403", res.status === 403, `status=${res.status}`);
  }

  // --- #12 unassign вне scope ---
  {
    // seller on storeB via owner; manager SELECTED only A
    const created = await api(ownerCookie, "/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: "Unassign OOS",
        email: uniqEmail("unasgoos"),
        password: "TestPass123!",
        role: "SELLER",
        storeId: storeB.id,
      }),
    });
    const target = created.ok ? await created.json() : null;
    const res = await api(
      managerCookie,
      `/api/stores/${storeB.id}/staff?userId=${encodeURIComponent(target?.id ?? "x")}`,
      { method: "DELETE" }
    );
    record(12, "unassign вне scope → 403", res.status === 403, `status=${res.status}`);
  }

  // --- #13 OWNER smoke ---
  {
    const res = await api(ownerCookie, "/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: "Owner Smoke Seller",
        email: uniqEmail("ownsm"),
        password: "TestPass123!",
        role: "SELLER",
        storeId: storeA.id,
      }),
    });
    const list = await api(ownerCookie, "/api/users");
    record(
      13,
      "OWNER flow unchanged",
      res.status === 201 && list.ok,
      `create=${res.status} list=${list.status}`
    );
  }

  // --- #14 SELLER smoke ---
  {
    const createAttempt = await api(sellerCookie, "/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: "Seller Hack",
        email: uniqEmail("selhack"),
        password: "TestPass123!",
        role: "SELLER",
        storeId: storeA.id,
      }),
    });
    const staffAttempt = await api(sellerCookie, `/api/stores/${storeA.id}/staff`, {
      method: "POST",
      body: JSON.stringify({ userId: createdSellerId ?? "x" }),
    });
    record(
      14,
      "SELLER no admin",
      createAttempt.status === 403 && staffAttempt.status === 403,
      `users=${createAttempt.status} staff=${staffAttempt.status}`
    );
  }

  // Restore manager defaults (sellers OFF, ALL or leave SELECTED — reset ALL + defaults)
  await putManagerPerms(ownerCookie, manager.id, {
    scopeMode: "ALL_STORES",
    storeIds: [],
    permissions: basePerms(),
  });

  const failed = results.filter((r) => !r.ok);
  console.log(
    JSON.stringify(
      {
        base: BASE,
        managerId: manager.id,
        storeA: storeA.id,
        storeB: storeB.id,
        passed: results.filter((r) => r.ok).length,
        failed: failed.length,
        results,
      },
      null,
      2
    )
  );

  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
