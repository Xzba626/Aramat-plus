import { redirect } from "next/navigation";

/** Suppliers hidden from UI (Part 4) — Prisma model kept. */
export default function SuppliersPage() {
  redirect("/warehouse");
}
