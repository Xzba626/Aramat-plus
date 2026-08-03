import { PrismaClient } from "@prisma/client";
import { getDashboardPayload } from "../src/lib/services/dashboard.service";
import { labelAction } from "../src/lib/i18n/labels";
import ru from "../src/messages/ru.json";
import tj from "../src/messages/tj.json";

const prisma = new PrismaClient();

function tFactory(dict: Record<string, unknown>) {
  return (key: string) => {
    const parts = key.split(".");
    let cur: unknown = dict;
    for (const p of parts) {
      if (cur == null || typeof cur !== "object") return key;
      cur = (cur as Record<string, unknown>)[p];
    }
    return typeof cur === "string" ? cur : key;
  };
}

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) throw new Error("no company");
  const d = await getDashboardPayload(company.id);
  const kinds = d.stores.map((s) => ({
    name: s.name,
    kind: s.kind,
    revenue: s.revenue,
    net: s.netProfit,
  }));
  console.log("stores:", JSON.stringify(kinds, null, 2));
  console.log(
    "has OWNER_DIRECT:",
    d.stores.some((s) => s.kind === "OWNER_DIRECT")
  );
  console.log(
    "storesNetSum",
    d.today.storesNetSum,
    "networkNet",
    d.today.netProfit,
    "match",
    d.today.storesNetMatchesNetwork
  );

  const tRu = tFactory(ru as Record<string, unknown>);
  const tTj = tFactory(tj as Record<string, unknown>);
  for (const a of [
    "REVISION_CREATE",
    "REVISION_COUNT",
    "REVISION_APPROVE",
    "REVISION_CANCEL",
  ]) {
    const ruL = labelAction(a, tRu);
    const tjL = labelAction(a, tTj);
    console.log(a, "→", { ru: ruL, tj: tjL });
    if (ruL === a || tjL === a) throw new Error(`untranslated ${a}`);
  }
  console.log("PASS dashboard personal-sales + revision labels");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
