import { redirect } from "next/navigation";

/** Legacy mobile hub — owner CRM uses the same sidebar as desktop (hamburger). */
export default function MorePage() {
  redirect("/dashboard");
}
