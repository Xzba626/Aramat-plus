import { redirect } from "next/navigation";

/** Orphan «Продавцы / POS» — team lives on /users, not a finance dump. */
export default function Page() {
  redirect("/users");
}
