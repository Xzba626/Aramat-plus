import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const rows = await p.$queryRaw<
    Array<{
      id: string;
      email: string;
      role: string;
      isActive: boolean;
      failedLoginCount: number;
      lockedUntil: Date | null;
      hash_len: number;
      hash_prefix: string;
      updatedAt: Date;
    }>
  >`
    SELECT id, email, role, "isActive", "failedLoginCount", "lockedUntil",
           length("passwordHash")::int as hash_len,
           left("passwordHash", 7) as hash_prefix,
           "updatedAt"
    FROM "User"
    WHERE role = 'OWNER' OR email ILIKE '%owner%'
    ORDER BY "createdAt" ASC
  `;
  console.log("OWNERS_RAW", JSON.stringify(rows, null, 2));

  for (const o of rows.filter((r) => r.role === "OWNER")) {
    const full = await p.$queryRaw<Array<{ passwordHash: string }>>`
      SELECT "passwordHash" FROM "User" WHERE id = ${o.id}
    `;
    const hash = full[0]?.passwordHash ?? "";
    for (const cand of ["Own-doWnBzTSj_rM", "owner1234"]) {
      console.log(
        "compare",
        o.email,
        cand,
        await bcrypt.compare(cand, hash)
      );
    }
  }

  // Does Prisma findUnique break without managerScopeMode?
  try {
    const u = await p.user.findUnique({
      where: { email: "owner@aromat.plus" },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        isActive: true,
        lockedUntil: true,
        failedLoginCount: true,
        role: true,
        companyId: true,
        storeId: true,
        name: true,
      },
    });
    console.log("FIND_UNIQUE_OK", u?.id, u?.email);
  } catch (e) {
    console.log("FIND_UNIQUE_FAIL", String(e).slice(0, 400));
  }

  // Column exists?
  const cols = await p.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'managerScopeMode'
  `;
  console.log("managerScopeMode_col", cols);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
