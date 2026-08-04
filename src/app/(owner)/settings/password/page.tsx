import { redirect } from "next/navigation";

/** Legacy URL — password lives under Security in Settings Center. */
export default function LegacyPasswordSettingsRedirect() {
  redirect("/settings/security");
}
