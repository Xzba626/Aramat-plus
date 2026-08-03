/**
 * Clear prefilled fact on open revisions (one-shot after nullable countedQty).
 * Run: npx tsx scripts/zt-revision-reset-open-facts.ts
 */
import { InventoryStatus, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const open = await prisma.inventorySession.findMany({
    where: { status: InventoryStatus.IN_PROGRESS },
    select: { id: true },
  });
  const ids = open.map((s) => s.id);
  if (!ids.length) {
    console.log("No open revisions");
    return;
  }
  const r = await prisma.inventoryItem.updateMany({
    where: { sessionId: { in: ids } },
    data: { countedQty: null, difference: 0 },
  });
  console.log(`Reset ${r.count} items across ${ids.length} open session(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
