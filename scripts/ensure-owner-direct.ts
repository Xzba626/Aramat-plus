import { PrismaClient } from "@prisma/client";
import { ensureOwnerDirectStore } from "../src/lib/services/owner-direct.service";

const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany();
  for (const c of companies) {
    const s = await ensureOwnerDirectStore(c.id);
    console.log(c.name, "→", s.name, s.id);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
