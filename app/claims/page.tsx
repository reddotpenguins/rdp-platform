import { redirect } from "next/navigation";
import { ClaimsClient } from "@/components/ClaimsClient";
import { canAccessClaims } from "@/lib/staffRoles";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";

export default async function ClaimsPage() {
  const { profile } = await requireActiveStaffSession();

  if (!canAccessClaims(profile)) {
    redirect("/dashboard");
  }

  return <ClaimsClient staffProfile={profile} />;
}
