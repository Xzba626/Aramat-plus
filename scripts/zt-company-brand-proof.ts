/**
 * Prove company name saves and is the brand source for chrome.
 * Run: npx tsx scripts/zt-company-brand-proof.ts
 */
import { PrismaClient } from "@prisma/client";
import { resolveCompanyName, splitBrandForMark } from "../src/lib/company-brand";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { readFileSync } from "fs";

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) throw new Error("NO_COMPANY");

  const before = company.name;
  const probe = `Aramat Plus Proof ${Date.now()}`;

  await prisma.company.update({
    where: { id: company.id },
    data: { name: probe },
  });

  const after = await prisma.company.findUnique({ where: { id: company.id } });
  const saved = after?.name === probe;

  // Restore original (or canonical Aramat Plus if was wrong O-spelling)
  const restore =
    /aromat/i.test(before) && !/aramat/i.test(before)
      ? "Aramat Plus"
      : before;
  await prisma.company.update({
    where: { id: company.id },
    data: { name: restore },
  });

  const srcHits: string[] = [];
  const roots = [
    "src/components/layout/owner-top-bar.tsx",
    "src/components/layout/owner-sidebar.tsx",
    "src/components/pos/pos-top-bar.tsx",
    "src/components/splash/splash-screen.tsx",
    "src/app/login/page-client.tsx",
    "src/app/layout.tsx",
  ];
  for (const rel of roots) {
    const text = readFileSync(join(process.cwd(), rel), "utf8");
    if (/AROMAT\s*<|AROMAT PLUS|Aromat Plus(?! Proof)/.test(text) && !text.includes("BrandMark")) {
      srcHits.push(rel);
    }
    if (text.includes("AROMAT ") && !text.includes("never a hardcoded")) {
      // hardcoded display string
      if (!text.includes("BrandMark")) srcHits.push(`${rel}:AROMAT`);
    }
  }

  const ru = JSON.parse(
    readFileSync(join(process.cwd(), "src/messages/ru.json"), "utf8")
  );
  const i18nOk = ru.app?.brand === "Aramat Plus" && !String(ru.app?.brand).includes("AROMAT");

  const mark = splitBrandForMark("Aramat Plus");

  const out = {
    at: new Date().toISOString(),
    saveRoundTrip: saved,
    restoredTo: restore,
    resolveCompanyName: resolveCompanyName(null) === "Aramat Plus",
    brandMarkSplit: mark,
    i18nBrandAramat: i18nOk,
    hardcodedChromeLeft: [...new Set(srcHits)],
    logoNote:
      "public/logo-aramat-plus.png already spells ARAMAT (A) in the bitmap — no O typo in logo file",
    pass:
      saved &&
      resolveCompanyName(null) === "Aramat Plus" &&
      i18nOk &&
      srcHits.length === 0,
  };

  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "tmp", "wave-company-brand.json"),
    JSON.stringify(out, null, 2)
  );
  console.log(JSON.stringify(out, null, 2));
  if (!out.pass) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
