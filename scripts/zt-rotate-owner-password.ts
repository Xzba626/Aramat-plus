/**
 * One-shot: rotate owner password if it still matches the known weak seed.
 * Prints the new password once to stdout — do not commit the output.
 *
 *   npx tsx scripts/zt-rotate-owner-password.ts
 */
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const WEAK = ["owner1234", "password", "12345678", "admin123"];

async function main() {
  const owner = await prisma.user.findFirst({
    where: { email: "owner@aromat.plus", role: "OWNER" },
    select: { id: true, email: true, passwordHash: true, name: true },
  });
  if (!owner) {
    console.error("Owner user not found");
    process.exit(1);
  }

  let wasWeak = false;
  for (const w of WEAK) {
    if (await bcrypt.compare(w, owner.passwordHash)) {
      wasWeak = true;
      console.log(`Owner still uses weak password "${w}" — rotating.`);
      break;
    }
  }
  if (!wasWeak) {
    console.log(
      "Owner password is not one of the known weak seed passwords. No change."
    );
    process.exit(0);
  }

  const next = crypto.randomBytes(18).toString("base64url");
  const hash = await bcrypt.hash(next, 12);
  await prisma.user.update({
    where: { id: owner.id },
    data: { passwordHash: hash },
  });
  console.log("UPDATED owner@aromat.plus");
  console.log("NEW_PASSWORD=" + next);
  console.log("Store this securely; it will not be shown in the app.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
