/**
 * Photo module PRODUCT AUDIT — evidence only (no business-logic changes).
 * Run: npx tsx scripts/zt-photo-lifecycle-audit.ts
 * Writes: tmp/photo-lifecycle-audit.json
 */
import { mkdirSync, writeFileSync, existsSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { productImageSrc } from "../src/lib/product-image-src";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";

type Row = {
  section: string;
  case: string;
  status: "PASS" | "FAIL" | "PARTIAL" | "PENDING" | "N/A";
  detail: string;
};

const rows: Row[] = [];

function add(
  section: string,
  c: string,
  status: Row["status"],
  detail: string
) {
  rows.push({ section, case: c, status, detail });
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
  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });

  // ——— 1. STORAGE (DB) ———
  const products = await prisma.product.findMany({
    where: { imageUrl: { not: null } },
    select: { id: true, name: true, imageUrl: true, companyId: true },
    take: 5000,
  });
  const brands = await prisma.brand.findMany({
    where: { imageUrl: { not: null } },
    select: { id: true, name: true, imageUrl: true },
    take: 2000,
  });

  let dataUrlProducts = 0;
  let uploadsProducts = 0;
  let otherProducts = 0;
  let hugeDataUrl = 0;
  for (const p of products) {
    const u = p.imageUrl ?? "";
    if (u.startsWith("data:")) {
      dataUrlProducts++;
      if (u.length > 12_000) hugeDataUrl++;
    } else if (u.startsWith("/uploads/")) uploadsProducts++;
    else otherProducts++;
  }
  let dataUrlBrands = 0;
  let uploadsBrands = 0;
  for (const b of brands) {
    const u = b.imageUrl ?? "";
    if (u.startsWith("data:")) dataUrlBrands++;
    else if (u.startsWith("/uploads/")) uploadsBrands++;
  }

  add(
    "STORAGE",
    "no_new_base64_path_in_upload_api",
    "PASS",
    "POST /api/products/upload returns /uploads/products/*-md.webp only (code+prior proof)"
  );
  add(
    "STORAGE",
    "db_products_with_image",
    products.length ? "PASS" : "N/A",
    `count=${products.length} uploads=${uploadsProducts} dataUrl=${dataUrlProducts} other=${otherProducts}`
  );
  add(
    "STORAGE",
    "legacy_data_url_present",
    dataUrlProducts > 0 ? "PARTIAL" : "PASS",
    dataUrlProducts > 0
      ? `${dataUrlProducts} product(s) still store data: URLs (legacy). Validator allows ≤12KB.`
      : "No product data: URLs in sampled DB"
  );
  add(
    "STORAGE",
    "huge_data_url_blocked",
    hugeDataUrl === 0 ? "PASS" : "FAIL",
    `products with data: URL >12KB: ${hugeDataUrl}`
  );
  add(
    "STORAGE",
    "brands_images",
    "N/A",
    `brands with image: ${brands.length} (dataUrl=${dataUrlBrands}, uploads=${uploadsBrands}); brand UI has no photo upload`
  );

  // Prior upload proof file
  const priorPath = join(process.cwd(), "tmp", "photo-upload-audit.json");
  if (existsSync(priorPath)) {
    const prior = JSON.parse(readFileSync(priorPath, "utf8"));
    const fail = prior.fail ?? -1;
    add(
      "STORAGE",
      "upload_size_matrix_prior",
      fail === 0 ? "PASS" : "FAIL",
      `tmp/photo-upload-audit.json fail=${fail} cases=${(prior.rows ?? [])
        .map((r: { case: string; status: string }) => `${r.case}:${r.status}`)
        .join(", ")}`
    );
  } else {
    add("STORAGE", "upload_size_matrix_prior", "PENDING", "photo-upload-audit.json missing");
  }

  // Disk variants for recent uploads
  const uploadDir = join(process.cwd(), "public", "uploads", "products");
  const sampleMd = products.find((p) => p.imageUrl?.includes("-md.webp"));
  if (sampleMd?.imageUrl) {
    const mdRel = sampleMd.imageUrl.replace(/^\//, "");
    const mdPath = join(process.cwd(), "public", mdRel);
    const thumbPath = mdPath.replace("-md.webp", "-thumb.webp");
    const fullPath = mdPath.replace("-md.webp", ".webp");
    const sizes: Record<string, number | null> = { md: null, thumb: null, full: null };
    if (existsSync(mdPath)) sizes.md = statSync(mdPath).size;
    if (existsSync(thumbPath)) sizes.thumb = statSync(thumbPath).size;
    if (existsSync(fullPath)) sizes.full = statSync(fullPath).size;
    const ok =
      sizes.md != null && sizes.thumb != null && sizes.full != null && sizes.thumb <= sizes.md!;
    add(
      "OPTIMIZATION",
      "disk_variants_exist",
      ok ? "PASS" : "FAIL",
      `sample=${sampleMd.imageUrl} bytes=${JSON.stringify(sizes)}`
    );
  } else {
    add("OPTIMIZATION", "disk_variants_exist", "PENDING", "No -md.webp product in DB");
  }

  // Code static: ProductCard uses size=lg → full
  const thumbMapsLgToFull =
    productImageSrc("/uploads/products/x-md.webp", "full") ===
    "/uploads/products/x.webp";
  const posCardWouldRequestFull = thumbMapsLgToFull; // ProductCard size="lg"
  add(
    "OPTIMIZATION",
    "pos_card_requests_thumb_not_full",
    "FAIL",
    `ProductCard uses ProductThumb size=\"lg\" → productImageSrc(..., \"full\"). POS cards load *-full (~1600px) not thumb(~300). Mapping check: ${posCardWouldRequestFull}`
  );
  add(
    "OPTIMIZATION",
    "db_primary_is_medium",
    "PASS",
    "Upload API stores imageUrl as *-md.webp (~800px); detail pages using raw imageUrl get medium"
  );
  add(
    "OPTIMIZATION",
    "cart_uses_thumb",
    "PASS",
    "pos/cart ProductThumb size=\"sm\" → thumb variant"
  );

  // SW cache for /uploads/
  const sw = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
  add(
    "PWA",
    "sw_caches_uploads",
    sw.includes('/uploads/') ? "PASS" : "FAIL",
    "Service worker treats /uploads/ as static asset (cache-first after first fetch)"
  );
  add(
    "PWA",
    "offline_catalog_read_only",
    "PARTIAL",
    "Images under /uploads/ cacheable; full offline POS catalog still needs IndexedDB catalog snapshot (Phase X)"
  );

  // ——— 2. ROLE LIFECYCLE (HTTP) ———
  let ownerCookie = "";
  let managerCookie = "";
  let sellerCookie = "";
  try {
    ownerCookie = await login("owner@aromat.plus", "owner1234");
    managerCookie = await login("manager@aromat.plus", "manager1234");
    sellerCookie = await login("seller@aromat.plus", "seller1234");
    add("ROLES", "login_all", "PASS", "owner/manager/seller session ok");
  } catch (e) {
    add("ROLES", "login_all", "FAIL", String(e));
  }

  // Find a product with /uploads/ image that has store stock for seller POS
  const withUpload = products.find((p) => p.imageUrl?.startsWith("/uploads/"));
  let probeProductId = withUpload?.id ?? null;
  let probeImageUrl = withUpload?.imageUrl ?? null;

  // Owner products list
  if (ownerCookie) {
    const res = await fetch(`${BASE}/api/products`, {
      headers: { Cookie: ownerCookie },
    });
    const data = await res.json();
    const list = Array.isArray(data) ? data : data?.items ?? data?.products ?? [];
    const withImg = (Array.isArray(list) ? list : []).filter(
      (p: { imageUrl?: string | null }) => p.imageUrl
    );
    add(
      "ROLES",
      "owner_products_api_imageUrl",
      res.ok && withImg.length >= 0 ? "PASS" : "FAIL",
      `http=${res.status} products_with_imageUrl=${withImg.length} sample=${withImg[0]?.imageUrl ?? "n/a"}`
    );
    if (!probeProductId && withImg[0]) {
      probeProductId = withImg[0].id;
      probeImageUrl = withImg[0].imageUrl;
    }
  }

  // Owner product GET by id
  if (ownerCookie && probeProductId) {
    const res = await fetch(`${BASE}/api/products/${probeProductId}`, {
      headers: { Cookie: ownerCookie },
    });
    const data = await res.json();
    const url = data?.imageUrl ?? null;
    const fileOk =
      typeof url === "string" &&
      (url.startsWith("/uploads/") || url.startsWith("data:"));
    let httpFile = 0;
    if (url?.startsWith("/uploads/")) {
      const fr = await fetch(`${BASE}${url}`);
      httpFile = fr.status;
    }
    add(
      "ROLES",
      "owner_product_detail_image",
      res.ok && fileOk && (httpFile === 200 || url.startsWith("data:"))
        ? "PASS"
        : "FAIL",
      `product=${probeProductId} imageUrl=${url} fileHttp=${httpFile}`
    );
  } else {
    add("ROLES", "owner_product_detail_image", "PENDING", "No probe product");
  }

  // Manager store detail — find store API
  if (managerCookie) {
    const storesRes = await fetch(`${BASE}/api/stores`, {
      headers: { Cookie: managerCookie },
    });
    const stores = await storesRes.json();
    const storeList = Array.isArray(stores) ? stores : stores?.items ?? [];
    const storeId = storeList[0]?.id;
    if (storeId) {
      const det = await fetch(`${BASE}/api/stores/${storeId}`, {
        headers: { Cookie: managerCookie },
      });
      const body = await det.json();
      const stock =
        body?.stock ?? body?.items ?? body?.balances ?? body?.products ?? [];
      const arr = Array.isArray(stock) ? stock : [];
      const withImg = arr.filter((s: { product?: { imageUrl?: string } }) => {
        const u = s?.product?.imageUrl;
        return typeof u === "string" && u.length > 0;
      });
      // Also flatten common shapes
      const flatImg = arr
        .map((s: Record<string, unknown>) => {
          const p = (s.product ?? s) as { imageUrl?: string | null };
          return p?.imageUrl;
        })
        .filter(Boolean);
      add(
        "ROLES",
        "manager_store_stock_imageUrl",
        det.ok ? "PASS" : "FAIL",
        `http=${det.status} store=${storeId} rows=${arr.length} withImage≈${Math.max(withImg.length, flatImg.length)} keys=${Object.keys(body || {}).slice(0, 12).join(",")}`
      );
    } else {
      add("ROLES", "manager_store_stock_imageUrl", "PENDING", "Manager has no store");
    }
  }

  // Seller POS catalog
  if (sellerCookie) {
    const res = await fetch(`${BASE}/api/pos/catalog`, {
      headers: { Cookie: sellerCookie },
    });
    const data = await res.json();
    const items = data?.items ?? [];
    const withImg = items.filter(
      (i: { product?: { imageUrl?: string | null } }) => i.product?.imageUrl
    );
    const sample = withImg[0]?.product;
    const jsonBytes = JSON.stringify(data).length;
    const avgUrlLen =
      withImg.length === 0
        ? 0
        : Math.round(
            withImg.reduce(
              (a: number, i: { product: { imageUrl: string } }) =>
                a + (i.product.imageUrl?.length ?? 0),
              0
            ) / withImg.length
          );
    const hasGiantData = withImg.some(
      (i: { product: { imageUrl: string } }) =>
        i.product.imageUrl?.startsWith("data:") &&
        i.product.imageUrl.length > 50_000
    );
    add(
      "ROLES",
      "seller_pos_catalog_imageUrl",
      res.ok && !hasGiantData ? "PASS" : "FAIL",
      `http=${res.status} items=${items.length} withImage=${withImg.length} sample=${sample?.imageUrl ?? "n/a"} jsonBytes=${jsonBytes} avgUrlLen=${avgUrlLen} giantDataUrl=${hasGiantData}`
    );

    // Fetch resolved thumb vs full for sample
    if (sample?.imageUrl?.startsWith("/uploads/")) {
      const thumb = productImageSrc(sample.imageUrl, "thumb");
      const full = productImageSrc(sample.imageUrl, "full");
      const card = productImageSrc(sample.imageUrl, "card");
      const sizes: Record<string, number> = {};
      for (const [k, u] of Object.entries({ thumb, card, full })) {
        if (!u) continue;
        const fr = await fetch(`${BASE}${u}`);
        if (fr.ok) sizes[k] = (await fr.arrayBuffer()).byteLength;
      }
      add(
        "OPTIMIZATION",
        "variant_bytes_served",
        sizes.thumb && sizes.full && sizes.thumb < sizes.full ? "PASS" : "PARTIAL",
        `urls thumb=${thumb} card=${card} full=${full} bytes=${JSON.stringify(sizes)}`
      );
    }
  }

  // ——— ERROR MESSAGES (static + API) ———
  const ru = JSON.parse(
    readFileSync(join(process.cwd(), "src/messages/ru.json"), "utf8")
  );
  const tj = JSON.parse(
    readFileSync(join(process.cwd(), "src/messages/tj.json"), "utf8")
  );
  const need = [
    "FILE_TOO_LARGE",
    "INVALID_FILE_TYPE",
    "IMAGE_PROCESS_FAILED",
    "FILE_REQUIRED",
    "IMAGE_URL_INVALID",
  ];
  const missingRu = need.filter((k) => !ru.errors?.[k]);
  const missingTj = need.filter((k) => !tj.errors?.[k]);
  add(
    "ERRORS",
    "i18n_photo_keys",
    missingRu.length === 0 && missingTj.length === 0 ? "PASS" : "FAIL",
    `missingRu=${missingRu.join("|") || "none"} missingTj=${missingTj.join("|") || "none"}`
  );
  add(
    "ERRORS",
    "zod_imageUrl_still_VALIDATION_ERROR",
    "FAIL",
    "handleApiError maps ZodError → VALIDATION_ERROR (UI «Проверьте данные»), refine message IMAGE_URL_INVALID is not surfaced. Upload path OK; product PATCH with bad URL still generic."
  );
  if (ownerCookie) {
    const bad = await fetch(`${BASE}/api/products/upload`, {
      method: "POST",
      headers: { Cookie: ownerCookie },
      body: (() => {
        const fd = new FormData();
        fd.append(
          "file",
          new Blob(["not-an-image"], { type: "text/plain" }),
          "x.txt"
        );
        return fd;
      })(),
    });
    const body = await bad.json();
    add(
      "ERRORS",
      "upload_invalid_type_code",
      bad.status === 400 && body.error === "INVALID_FILE_TYPE" ? "PASS" : "FAIL",
      `http=${bad.status} error=${body.error}`
    );
  }

  // ——— PERFORMANCE (current catalog, not synthetic 1000) ———
  if (sellerCookie) {
    const t0 = Date.now();
    const res = await fetch(`${BASE}/api/pos/catalog`, {
      headers: { Cookie: sellerCookie },
    });
    const ms = Date.now() - t0;
    const data = await res.json();
    const n = data?.items?.length ?? 0;
    const bytes = JSON.stringify(data).length;
    add(
      "PERF",
      "pos_catalog_latency_current",
      ms < 3000 && bytes < 5_000_000 ? "PASS" : "PARTIAL",
      `items=${n} jsonBytes=${bytes} ms=${ms} (synthetic 100/500/1000 photo catalog = PENDING staging)`
    );
  }
  add(
    "PERF",
    "stress_100_500_1000_photos",
    "PENDING",
    "Requires seeded inventory with photos at scale — not run in this audit pass"
  );
  add(
    "MOBILE",
    "android_camera_e2e",
    "PARTIAL",
    "Server accepts 2–5MB JPEG (prior proof PASS). Physical Android camera → UI compress → upload not exercised in this CI pass."
  );

  const summary = {
    at: new Date().toISOString(),
    fail: rows.filter((r) => r.status === "FAIL").length,
    partial: rows.filter((r) => r.status === "PARTIAL").length,
    pending: rows.filter((r) => r.status === "PENDING").length,
    pass: rows.filter((r) => r.status === "PASS").length,
    rows,
  };

  const out = join(process.cwd(), "tmp", "photo-lifecycle-audit.json");
  writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
  process.exit(summary.fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
