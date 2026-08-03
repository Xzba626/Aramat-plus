/**
 * PHOTO-CREATE-E2E — mirrors UI warehouse/new flow exactly.
 * Evidence only. Writes tmp/photo-create-product-flow.json
 *
 * Run: npx tsx scripts/zt-photo-create-product-flow.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { productSchema } from "../src/lib/validators";
import { sanitizeIncomingImageUrl } from "../src/lib/product-image-url";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";

type Step = {
  step: string;
  status: "PASS" | "FAIL" | "INFO";
  http?: number;
  detail: string;
  body?: unknown;
};

const steps: Step[] = [];

function log(
  step: string,
  status: Step["status"],
  detail: string,
  extra?: { http?: number; body?: unknown }
) {
  steps.push({ step, status, detail, ...extra });
  console.log(`[${status}] ${step}: ${detail}`);
}

async function login(email: string, password: string) {
  const jar = new Map<string, string>();
  const absorb = (h: Headers) => {
    for (const raw of h.getSetCookie()) {
      const p = raw.split(";")[0];
      const i = p.indexOf("=");
      if (i > 0) jar.set(p.slice(0, i), p.slice(i + 1));
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  absorb(csrfRes.headers);
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie(),
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: `${BASE}/`,
      json: "true",
    }),
    redirect: "manual",
  });
  absorb(res.headers);
  return cookie();
}

async function main() {
  const cookie = await login("owner@aromat.plus", "owner1234");
  log("login", "PASS", "owner session");

  // Categories like UI
  const catsRes = await fetch(`${BASE}/api/categories?seedDefaults=1`, {
    headers: { Cookie: cookie },
  });
  const cats = await catsRes.json();
  const categoryId = Array.isArray(cats) ? cats[0]?.id : null;
  log(
    "categories",
    categoryId ? "PASS" : "FAIL",
    `http=${catsRes.status} categoryId=${categoryId}`,
    { http: catsRes.status }
  );

  // Simulate phone JPEG ~2MB
  const jpeg = await sharp({
    create: {
      width: 2400,
      height: 1800,
      channels: 3,
      noise: { type: "gaussian", mean: 110, sigma: 40 },
    },
  })
    .jpeg({ quality: 88 })
    .toBuffer();

  log("file_select", "INFO", `name=phone.jpg type=image/jpeg size=${jpeg.length}`);

  // Client compress approx: we send jpeg as UI would after compress (JPEG not webp)
  const compressed = await sharp(jpeg)
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  log(
    "client_compress",
    "PASS",
    `in=${jpeg.length} out=${compressed.length} type=image/jpeg`
  );

  // Upload — same as onPhotoChange
  const fd = new FormData();
  fd.append(
    "file",
    new Blob([compressed], { type: "image/jpeg" }),
    "phone.jpg"
  );
  const upRes = await fetch(`${BASE}/api/products/upload`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: fd,
  });
  const upBody = await upRes.json();
  const imageUrl = upBody.imageUrl ?? null;
  log(
    "upload_api",
    upRes.status === 201 && imageUrl ? "PASS" : "FAIL",
    `http=${upRes.status} imageUrl=${imageUrl} error=${upBody.error ?? null}`,
    { http: upRes.status, body: upBody }
  );

  // State handoff check: imageUrl would be setImageUrl(data.imageUrl)
  log(
    "state_imageUrl",
    imageUrl && String(imageUrl).startsWith("/uploads/")
      ? "PASS"
      : "FAIL",
    `React would hold imageUrl=${imageUrl}`
  );

  // Exact UI payload from onSubmit
  const uiPayload = {
    name: `E2E Flow ${Date.now()}`,
    description: null as string | null,
    brandId: null as string | null,
    categoryId,
    accountingType: "PIECE" as const,
    imageUrl,
    salePrice: 150,
    defaultCostPerUnit: 80,
    initialQuantity: 5,
  };

  // Local Zod preview (what server does after sanitize)
  const { imageUrl: safeImage, stripped } = sanitizeIncomingImageUrl(
    uiPayload.imageUrl
  );
  let zodOk = true;
  let zodErr: unknown = null;
  try {
    productSchema.parse({ ...uiPayload, imageUrl: safeImage });
  } catch (e) {
    zodOk = false;
    zodErr = e;
  }
  log(
    "zod_local",
    zodOk ? "PASS" : "FAIL",
    `stripped=${stripped} err=${zodErr instanceof Error ? zodErr.message : JSON.stringify(zodErr)?.slice(0, 200)}`
  );

  const createRes = await fetch(`${BASE}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(uiPayload),
  });
  const createBody = await createRes.json();
  log(
    "create_product",
    createRes.status === 201 && createBody.id ? "PASS" : "FAIL",
    `http=${createRes.status} id=${createBody.id ?? null} error=${createBody.error ?? null} imageUrl=${createBody.imageUrl ?? null}`,
    { http: createRes.status, body: { id: createBody.id, imageUrl: createBody.imageUrl, error: createBody.error, imageWarning: createBody.imageWarning } }
  );

  // Prove image persisted
  if (createBody.id) {
    const getRes = await fetch(`${BASE}/api/products/${createBody.id}`, {
      headers: { Cookie: cookie },
    });
    const got = await getRes.json();
    log(
      "db_imageUrl",
      got.imageUrl === imageUrl ? "PASS" : "FAIL",
      `stored=${got.imageUrl} expected=${imageUrl}`,
      { http: getRes.status }
    );

    // File reachable
    if (got.imageUrl?.startsWith("/uploads/")) {
      const fileRes = await fetch(`${BASE}${got.imageUrl}`);
      log(
        "file_http",
        fileRes.status === 200 ? "PASS" : "FAIL",
        `http=${fileRes.status}`,
        { http: fileRes.status }
      );
    }
  }

  // Edge cases that map to UI "Внутренняя ошибка сервера" vs typed errors
  const edgeCases = [];

  // A) create WITHOUT waiting for upload (imageUrl null) — should still work
  const noPhoto = await fetch(`${BASE}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      name: `E2E NoPhoto ${Date.now()}`,
      categoryId,
      accountingType: "PIECE",
      imageUrl: null,
      salePrice: 10,
      defaultCostPerUnit: 5,
    }),
  });
  const noPhotoBody = await noPhoto.json();
  edgeCases.push({
    case: "create_without_photo",
    http: noPhoto.status,
    error: noPhotoBody.error ?? null,
    id: noPhotoBody.id ?? null,
  });

  // B) create with imageUrl but upload never done — valid path that 404s as file (still valid string)
  const fakeUrl = await fetch(`${BASE}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      name: `E2E FakeUrl ${Date.now()}`,
      categoryId,
      accountingType: "PIECE",
      imageUrl: "/uploads/products/does-not-exist-md.webp",
      salePrice: 10,
      defaultCostPerUnit: 5,
    }),
  });
  const fakeBody = await fakeUrl.json();
  edgeCases.push({
    case: "create_with_dangling_imageUrl",
    http: fakeUrl.status,
    error: fakeBody.error ?? null,
    id: fakeBody.id ?? null,
  });

  // C) empty brandId string like buggy form
  const emptyBrand = await fetch(`${BASE}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      name: `E2E EmptyBrand ${Date.now()}`,
      categoryId,
      brandId: "",
      accountingType: "PIECE",
      imageUrl,
      salePrice: 10,
      defaultCostPerUnit: 5,
    }),
  });
  const emptyBrandBody = await emptyBrand.json();
  edgeCases.push({
    case: "create_brandId_empty_string",
    http: emptyBrand.status,
    error: emptyBrandBody.error ?? null,
    id: emptyBrandBody.id ?? null,
    prismaHint:
      emptyBrand.status >= 500
        ? "Likely FK/cuid failure → INTERNAL_ERROR or DB_ERROR"
        : null,
  });

  // D) invalid brandId cuid
  const badBrand = await fetch(`${BASE}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      name: `E2E BadBrand ${Date.now()}`,
      categoryId,
      brandId: "not-a-cuid",
      accountingType: "PIECE",
      imageUrl,
      salePrice: 10,
      defaultCostPerUnit: 5,
    }),
  });
  const badBrandBody = await badBrand.json();
  edgeCases.push({
    case: "create_brandId_invalid",
    http: badBrand.status,
    error: badBrandBody.error ?? null,
    id: badBrandBody.id ?? null,
  });

  // E) defaultCostPerUnit null with initialQuantity — COST_REQUIRED
  const costReq = await fetch(`${BASE}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      name: `E2E CostReq ${Date.now()}`,
      categoryId,
      accountingType: "PIECE",
      imageUrl,
      salePrice: 10,
      defaultCostPerUnit: null,
      initialQuantity: 3,
    }),
  });
  const costReqBody = await costReq.json();
  edgeCases.push({
    case: "qty_without_cost",
    http: costReq.status,
    error: costReqBody.error ?? null,
  });

  // F) race: submit while imageUrl still null (user clicks create before upload finishes)
  const race = await fetch(`${BASE}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      name: `E2E RaceNullImage ${Date.now()}`,
      categoryId,
      accountingType: "PIECE",
      imageUrl: null,
      salePrice: 12,
      defaultCostPerUnit: 6,
      initialQuantity: 1,
    }),
  });
  const raceBody = await race.json();
  edgeCases.push({
    case: "submit_before_upload_completes_imageUrl_null",
    http: race.status,
    error: raceBody.error ?? null,
    id: raceBody.id ?? null,
    note: "Product created WITHOUT photo — UI success but photo missing; not INTERNAL_ERROR",
  });

  log(
    "edge_cases",
    "INFO",
    JSON.stringify(edgeCases),
    { body: edgeCases }
  );

  // Root cause synthesis
  const happy =
    steps.find((s) => s.step === "upload_api")?.status === "PASS" &&
    steps.find((s) => s.step === "create_product")?.status === "PASS" &&
    steps.find((s) => s.step === "db_imageUrl")?.status === "PASS";

  const internalEdges = edgeCases.filter(
    (e) => e.http === 500 || e.error === "INTERNAL_ERROR" || e.error === "DB_ERROR"
  );

  const report = {
    at: new Date().toISOString(),
    verdict: happy
      ? "HAPPY_PATH_PASS — upload→create→DB works when imageUrl is set"
      : "HAPPY_PATH_FAIL",
    rootCauseHypotheses: [
      {
        id: "H1_upload_create_handoff",
        likelihood: happy ? "LOW (proven handoff works)" : "HIGH",
        detail:
          "UI sets imageUrl from upload response then POSTs it. Code path verified.",
      },
      {
        id: "H2_react_stale_state",
        likelihood: "MEDIUM if user submits during uploading",
        detail:
          "Submit disabled while uploading=true. If upload fails silently or user races, imageUrl stays null — product still creates without photo (not INTERNAL_ERROR).",
      },
      {
        id: "H3_image_process",
        likelihood: happy ? "LOW for valid JPEG" : "HIGH",
        detail: "Upload of compressed JPEG returned " + (upRes.status === 201 ? "201" : String(upRes.status)),
      },
      {
        id: "H4_create_throws_INTERNAL_ERROR",
        likelihood: internalEdges.length ? "HIGH" : "NEEDS_UI_REPRO",
        detail:
          internalEdges.length > 0
            ? `Reproduced 500/INTERNAL: ${JSON.stringify(internalEdges)}`
            : "Happy path and edge cases did not return INTERNAL_ERROR in this run. UI 'Внутренняя ошибка сервера' = error code INTERNAL_ERROR from handleApiError (unmapped exception).",
      },
    ],
    uiErrorMapping: {
      INTERNAL_ERROR: "Внутренняя ошибка сервера (ru.json)",
      IMAGE_PROCESS_FAILED: "Не удалось обработать фотографию…",
      note: "If UI shows INTERNAL_ERROR, failure is create/product stack — not typed image error.",
    },
    steps,
    edgeCases,
    fail: steps.filter((s) => s.status === "FAIL").length,
  };

  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "tmp", "photo-create-product-flow.json"),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
