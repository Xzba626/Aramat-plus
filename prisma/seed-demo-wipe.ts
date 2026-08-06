/**
 * DESTRUCTIVE demo wipe + full reseed.
 *
 * Only for empty local Docker demos. NEVER run on Contabo / production.
 *
 *   SEED_WIPE_CONFIRM=YES_DELETE_ALL npx tsx prisma/seed-demo-wipe.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (process.env.SEED_WIPE_CONFIRM !== "YES_DELETE_ALL") {
    console.error(
      "Refusing wipe. Set SEED_WIPE_CONFIRM=YES_DELETE_ALL to proceed.\n" +
        "Prefer: npx prisma db seed (safe upsert) or Owner wipe UI."
    );
    process.exit(1);
  }
  console.error(
    "This script was retired as a default seed.\n" +
      "Use Owner Settings → Wipe in the app, or restore from pg_dump backup.\n" +
      "Safe bootstrap: npx prisma db seed"
  );
  process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
