import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const p = new PrismaClient();
async function main() {
  for (const email of [
    "owner@aromat.plus",
    "manager@aromat.plus",
    "seller@aromat.plus",
  ]) {
    const u = await p.user.findFirst({ where: { email } });
    if (!u) {
      console.log(email, "MISSING");
      continue;
    }
    const candidates = ["owner1234", "manager1234", "seller1234"];
    const hits = [];
    for (const c of candidates) {
      if (await bcrypt.compare(c, u.passwordHash)) hits.push(c);
    }
    console.log(email, u.role, hits.length ? `match ${hits.join(",")}` : "no seed password match");
  }
}
main()
  .catch(console.error)
  .finally(() => p.$disconnect());
