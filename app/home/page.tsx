import { redirect } from "next/navigation";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";

export default async function HomeRouterPage() {
  const { profile } = await requireActiveStaffSession();

  if (profile.role === "admin") {
    redirect("/admin");
  }

  redirect("/dashboard");
}
