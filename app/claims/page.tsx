import { ClaimsClient } from "@/components/ClaimsClient";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";

export default async function ClaimsPage() {
  const { profile } = await requireActiveStaffSession();

  return <ClaimsClient staffProfile={profile} />;
}
