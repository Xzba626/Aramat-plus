import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  try {
    const c = await p.company.findFirst();
    console.log("DB_OK", c?.id ?? "no-company");
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error("DB_FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
