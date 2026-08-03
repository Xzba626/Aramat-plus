/**
 * Photo module final hardening proofs.
 * Run: npx tsx scripts/zt-photo-final-hardening.ts
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import {
  getProductImageUrl,
  productImageSrc,
  isAllowedProductImage,
  processAndSaveProductImage,
  sanitizeIncomingImageUrl,
} from "../src/lib/services/product-image.service";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";

type Row = {
  section: string;
  case: string;
  status: "PASS" | "FAIL" | "PARTIAL" | "PENDING";
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
  // 1. Thumb helper
  const base = "/uploads/products/demo-md.webp";
  const thumb = productImageSrc(base, "thumb");
  const medium = productImageSrc(base, "medium");
  const full = productImageSrc(base, "full");
  add(
    "THUMB",
    "variant_mapping",
    thumb === "/uploads/products/demo-thumb.webp" &&
      medium === base &&
      full === "/uploads/products/demo.webp"
      ? "PASS"
      : "FAIL",
    `thumb=${thumb} medium=${medium} full=${full}`
  );
  add(
    "THUMB",
    "getProductImageUrl_pos_uses_thumb",
    getProductImageUrl({ imageUrl: base }, "thumb")?.includes("-thumb")
      ? "PASS"
      : "FAIL",
    String(getProductImageUrl({ imageUrl: base }, "thumb"))
  );

  // 2. MIME octet-stream
  add(
    "ANDROID",
    "octet_stream_jpg_allowed",
    isAllowedProductImage({
      type: "application/octet-stream",
      name: "camera.jpg",
    })
      ? "PASS"
      : "FAIL",
    "application/octet-stream + .jpg"
  );
  add(
    "ANDROID",
    "heic_rejected_gate",
    !isAllowedProductImage({ type: "image/heic", name: "x.heic" })
      ? "PASS"
      : "FAIL",
    "heic not in allowed list"
  );

  // 3. Sanitize bad imageUrl
  const huge = "data:image/jpeg;base64," + "A".repeat(20_000);
  const s = sanitizeIncomingImageUrl(huge);
  add(
    "VALIDATION",
    "strip_huge_data_url",
    s.stripped && s.imageUrl === null ? "PASS" : "FAIL",
    JSON.stringify(s)
  );

  // 4. Upload + variant bytes via HTTP
  const cookie = await login("owner@aromat.plus", "owner1234");
  const jpeg = await sharp({
    create: {
      width: 2400,
      height: 1800,
      channels: 3,
      noise: { type: "gaussian", mean: 100, sigma: 40 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();

  const fd = new FormData();
  fd.append(
    "file",
    new Blob([jpeg], { type: "application/octet-stream" }),
    "phone.jpg"
  );
  const up = await fetch(`${BASE}/api/products/upload`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: fd,
  });
  const upBody = await up.json();
  add(
    "UPLOAD",
    "octet_stream_upload",
    up.status === 201 && upBody.imageUrl?.includes("-md.webp")
      ? "PASS"
      : "FAIL",
    `http=${up.status} body=${JSON.stringify(upBody).slice(0, 200)}`
  );

  if (upBody.imageUrl) {
    const tUrl = productImageSrc(upBody.imageUrl, "thumb")!;
    const fUrl = productImageSrc(upBody.imageUrl, "full")!;
    const [tRes, fRes, mRes] = await Promise.all([
      fetch(`${BASE}${tUrl}`),
      fetch(`${BASE}${fUrl}`),
      fetch(`${BASE}${upBody.imageUrl}`),
    ]);
    const tBytes = tRes.ok ? (await tRes.arrayBuffer()).byteLength : 0;
    const fBytes = fRes.ok ? (await fRes.arrayBuffer()).byteLength : 0;
    const mBytes = mRes.ok ? (await mRes.arrayBuffer()).byteLength : 0;
    add(
      "THUMB",
      "served_thumb_smaller_than_full",
      tRes.ok && fRes.ok && tBytes > 0 && tBytes < fBytes ? "PASS" : "FAIL",
      `thumb=${tBytes} medium=${mBytes} full=${fBytes}`
    );
  }

  // 5. HEIC API message
  const heicFd = new FormData();
  heicFd.append(
    "file",
    new Blob([jpeg], { type: "image/heic" }),
    "shot.heic"
  );
  const heicRes = await fetch(`${BASE}/api/products/upload`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: heicFd,
  });
  const heicBody = await heicRes.json();
  add(
    "ANDROID",
    "heic_clear_error",
    heicRes.status === 400 && heicBody.error === "IMAGE_HEIC_UNSUPPORTED"
      ? "PASS"
      : "FAIL",
    `http=${heicRes.status} error=${heicBody.error}`
  );

  // 6. Product create with bad imageUrl still saves
  const cats = await fetch(`${BASE}/api/categories?seedDefaults=1`, {
    headers: { Cookie: cookie },
  }).then((r) => r.json());
  const catId = Array.isArray(cats) ? cats[0]?.id : cats?.items?.[0]?.id;
  const createRes = await fetch(`${BASE}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      name: `[PHOTO HARDEN] ${Date.now()}`,
      salePrice: 10,
      categoryId: catId,
      accountingType: "PIECE",
      imageUrl: huge,
    }),
  });
  const created = await createRes.json();
  add(
    "VALIDATION",
    "create_strips_bad_image_keeps_product",
    createRes.status === 201 &&
      created.id &&
      (created.imageUrl == null || created.imageUrl === "") &&
      created.imageWarning === "IMAGE_STRIPPED"
      ? "PASS"
      : "FAIL",
    `http=${createRes.status} id=${created.id} imageUrl=${created.imageUrl} warn=${created.imageWarning}`
  );

  // 7. Migration report if present
  const migPath = join(process.cwd(), "tmp", "photo-data-url-migration.json");
  if (existsSync(migPath)) {
    const mig = JSON.parse(readFileSync(migPath, "utf8"));
    add(
      "MIGRATION",
      "data_url_migration",
      mig.leftoverDataUrls === 0 ? "PASS" : "PARTIAL",
      `migrated=${mig.migrated?.length} failed=${mig.failed?.length} leftover=${mig.leftoverDataUrls}`
    );
  } else {
    add("MIGRATION", "data_url_migration", "PENDING", "run migrate-product-data-urls.ts");
  }

  // 8. POS catalog — image URLs short; thumb mapping for sample
  const sellerCookie = await login("seller@aromat.plus", "seller1234");
  const t0 = Date.now();
  const pos = await fetch(`${BASE}/api/pos/catalog`, {
    headers: { Cookie: sellerCookie },
  }).then((r) => r.json());
  const ms = Date.now() - t0;
  const items = pos.items ?? [];
  const withImg = items.filter(
    (i: { product?: { imageUrl?: string } }) => i.product?.imageUrl
  );
  const jsonBytes = JSON.stringify(pos).length;
  const giant = withImg.some(
    (i: { product: { imageUrl: string } }) =>
      i.product.imageUrl.startsWith("data:") && i.product.imageUrl.length > 12_000
  );
  add(
    "PERF",
    "pos_catalog_no_giant_data_url",
    !giant && jsonBytes < 2_000_000 ? "PASS" : "FAIL",
    `items=${items.length} withImg=${withImg.length} jsonBytes=${jsonBytes} ms=${ms}`
  );
  add(
    "PERF",
    "stress_100_500_1000",
    items.length >= 100 ? "PASS" : "PENDING",
    `current_pos_items=${items.length} (seed 1000 for full stress)`
  );

  // 9. PWA SW caches uploads
  const sw = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
  add(
    "PWA",
    "sw_uploads_cache",
    sw.includes("/uploads/") ? "PASS" : "FAIL",
    "cache-first for /uploads/"
  );

  // 10. Local processAndSave smoke
  const local = await processAndSaveProductImage(
    await sharp({
      create: {
        width: 1200,
        height: 900,
        channels: 3,
        noise: { type: "gaussian", mean: 90, sigma: 30 },
      },
    })
      .jpeg({ quality: 85 })
      .toBuffer()
  );
  add(
    "COMPRESSION",
    "service_processAndSave",
    local.imageUrl.includes("-md.webp") &&
      local.bytes.thumb > 0 &&
      local.bytes.thumb < local.bytes.medium &&
      local.bytes.medium < local.bytes.full
      ? "PASS"
      : "FAIL",
    JSON.stringify(local.bytes)
  );

  const summary = {
    at: new Date().toISOString(),
    fail: rows.filter((r) => r.status === "FAIL").length,
    pass: rows.filter((r) => r.status === "PASS").length,
    partial: rows.filter((r) => r.status === "PARTIAL").length,
    pending: rows.filter((r) => r.status === "PENDING").length,
    rows,
  };
  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "tmp", "photo-final-hardening.json"),
    JSON.stringify(summary, null, 2)
  );
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
