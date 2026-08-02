import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Reservation" ALTER COLUMN "expiresAt" DROP NOT NULL`
  );
  console.log("OK: Reservation.expiresAt nullable");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
