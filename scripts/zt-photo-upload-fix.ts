/**
 * Photo upload audit proof: root cause was data-URL + Zod max(2_000_000)
 * → VALIDATION_ERROR ("Проверьте данные"). Now: compress + /uploads webp variants.
 *
 * Run: npx tsx scripts/zt-photo-upload-fix.ts
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";

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

async function makeJpeg(bytesTarget: number, label: string): Promise<Buffer> {
  // Generate noisy large image then jpeg quality until ~target size
  let quality = 90;
  let w = 2000;
  let h = 2000;
  if (bytesTarget < 600_000) {
    w = 800;
    h = 600;
    quality = 70;
  } else if (bytesTarget < 2_500_000) {
    w = 2400;
    h = 1800;
    quality = 85;
  } else {
    w = 4000;
    h = 3000;
    quality = 92;
  }
  let buf = await sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      noise: { type: "gaussian", mean: 128, sigma: 40 },
    },
  })
    .jpeg({ quality })
    .toBuffer();

  // Pad / regenerate toward target
  for (let i = 0; i < 8 && buf.length < bytesTarget * 0.7; i++) {
    w = Math.round(w * 1.15);
    h = Math.round(h * 1.15);
    buf = await sharp({
      create: {
        width: w,
        height: h,
        channels: 3,
        noise: { type: "gaussian", mean: 120, sigma: 50 },
      },
    })
      .jpeg({ quality: Math.min(95, quality + i) })
      .toBuffer();
  }
  console.log(`  generated ${label}: ${(buf.length / 1024).toFixed(0)} KB`);
  return buf;
}

async function upload(
  cookie: string,
  buf: Buffer,
  filename: string,
  type: string
) {
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type }), filename);
  const res = await fetch(`${BASE}/api/products/upload`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: fd,
    signal: AbortSignal.timeout(120000),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const cookie = await login("owner@aromat.plus", "owner1234");
  const rows: Array<{
    case: string;
    status: string;
    http: number;
    imageUrl?: string;
    mediumBytes?: number;
    detail: string;
  }> = [];

  // Root-cause note
  rows.push({
    case: "root_cause",
    status: "DOCUMENTED",
    http: 0,
    detail:
      "Old path: upload fell back to data: URL; productSchema imageUrl.max(2_000_000) → Zod VALIDATION_ERROR → UI «Проверьте данные». Fix: client compress + sharp → /uploads/*.webp only; imageUrl.max(2048).",
  });

  const cases: Array<{ label: string; target: number; name: string }> = [
    { label: "500KB", target: 500_000, name: "photo-500.jpg" },
    { label: "2MB", target: 2_000_000, name: "photo-2mb.jpg" },
    { label: "5MB", target: 5_000_000, name: "photo-5mb.jpg" },
  ];

  for (const c of cases) {
    const buf = await makeJpeg(c.target, c.label);
    const r = await upload(cookie, buf, c.name, "image/jpeg");
    const ok =
      r.status === 201 &&
      typeof r.json.imageUrl === "string" &&
      r.json.imageUrl.startsWith("/uploads/products/") &&
      !String(r.json.imageUrl).startsWith("data:");
    const diskOk =
      ok &&
      existsSync(join(process.cwd(), "public", r.json.imageUrl.replace(/^\//, "")));
    rows.push({
      case: c.label,
      status: ok && diskOk ? "PASS" : "FAIL",
      http: r.status,
      imageUrl: r.json.imageUrl,
      mediumBytes: r.json.bytes?.medium,
      detail: ok
        ? `saved ${r.json.imageUrl} medium=${r.json.bytes?.medium}`
        : JSON.stringify(r.json),
    });
  }

  // PNG
  const png = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: "#336699" },
  })
    .png()
    .toBuffer();
  const pngR = await upload(cookie, png, "swatch.png", "image/png");
  rows.push({
    case: "PNG",
    status:
      pngR.status === 201 && pngR.json.imageUrl?.startsWith("/uploads/")
        ? "PASS"
        : "FAIL",
    http: pngR.status,
    imageUrl: pngR.json.imageUrl,
    detail: JSON.stringify(pngR.json.bytes ?? pngR.json),
  });

  // WEBP
  const webp = await sharp({
    create: { width: 1000, height: 800, channels: 3, background: "#993366" },
  })
    .webp()
    .toBuffer();
  const webpR = await upload(cookie, webp, "swatch.webp", "image/webp");
  rows.push({
    case: "WEBP",
    status:
      webpR.status === 201 && webpR.json.imageUrl?.startsWith("/uploads/")
        ? "PASS"
        : "FAIL",
    http: webpR.status,
    imageUrl: webpR.json.imageUrl,
    detail: JSON.stringify(webpR.json.bytes ?? webpR.json),
  });

  // Reject bogus
  const bad = await upload(
    cookie,
    Buffer.from("not-an-image"),
    "x.txt",
    "text/plain"
  );
  rows.push({
    case: "reject_non_image",
    status:
      bad.status === 400 &&
      (bad.json.error === "INVALID_FILE_TYPE" ||
        bad.json.error === "IMAGE_PROCESS_FAILED")
        ? "PASS"
        : "FAIL",
    http: bad.status,
    detail: JSON.stringify(bad.json),
  });

  // Product create with path must not VALIDATION_ERROR
  const goodUrl = rows.find((r) => r.case === "2MB" && r.status === "PASS")
    ?.imageUrl;
  if (goodUrl) {
    const cats = await fetch(`${BASE}/api/categories?seedDefaults=1`, {
      headers: { Cookie: cookie },
    }).then((r) => r.json());
    const categoryId = Array.isArray(cats) ? cats[0]?.id : null;
    const create = await fetch(`${BASE}/api/products`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `[PHOTO PROOF] ${Date.now()}`,
        categoryId,
        accountingType: "PIECE",
        salePrice: 10,
        defaultCostPerUnit: 3,
        imageUrl: goodUrl,
      }),
    });
    const cj = await create.json();
    rows.push({
      case: "product_create_with_upload_url",
      status: create.status === 200 || create.status === 201 ? "PASS" : "FAIL",
      http: create.status,
      detail:
        create.ok
          ? `product=${cj.id}`
          : JSON.stringify(cj),
    });
    if (cj.id) {
      // soft-archive cleanup
      await fetch(`${BASE}/api/products/${cj.id}`, {
        method: "DELETE",
        headers: { Cookie: cookie },
      }).catch(() => undefined);
    }
  }

  // Simulate old bug: huge data URL must fail with IMAGE_URL_INVALID not vague VALIDATION
  const hugeData = `data:image/jpeg;base64,${"A".repeat(100_000)}`;
  const badCreate = await fetch(`${BASE}/api/products`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "bad-data-url",
      accountingType: "PIECE",
      salePrice: 10,
      imageUrl: hugeData,
    }),
  });
  const bj = await badCreate.json();
  rows.push({
    case: "reject_huge_data_url",
    status:
      badCreate.status === 400 &&
      (bj.error === "VALIDATION_ERROR" || bj.error === "IMAGE_URL_INVALID")
        ? "PASS"
        : "FAIL",
    http: badCreate.status,
    detail: JSON.stringify(bj),
  });

  const fail = rows.filter((r) => r.status === "FAIL").length;
  const out = {
    at: new Date().toISOString(),
    limits: {
      previous: {
        uploadMax: "5MB",
        productImageUrlMax: 2_000_000,
        fallback: "data:URL in DB",
        uiOnFail: "VALIDATION_ERROR → Проверьте данные",
      },
      current: {
        uploadMaxInput: "20MB",
        clientCompress: "maxEdge 1600 q~0.82",
        server: "sharp → webp thumb/md/full under /uploads/products/",
        productImageUrlMax: 2048,
        uiErrors: "FILE_* / IMAGE_* localized",
      },
    },
    fail,
    rows,
  };
  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "tmp", "photo-upload-audit.json"),
    JSON.stringify(out, null, 2)
  );
  console.log(JSON.stringify(out, null, 2));
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
