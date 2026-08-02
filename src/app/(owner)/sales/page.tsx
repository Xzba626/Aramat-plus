import { redirect } from "next/navigation";

/** Orphan route — sales finance lives on Dashboard / Analytics, not here. */
export default function SalesPage() {
  redirect("/dashboard");
}
