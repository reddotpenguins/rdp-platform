import { redirect } from "next/navigation";
import { RbaAdminClient } from "@/components/RbaAdminClient";
import { canManageStaffAccess } from "@/lib/staffRoles";
import { getStaffManagementProfiles } from "@/lib/supabase/staffAdmin";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";

type RbaPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function RbaPage({ searchParams }: RbaPageProps) {
  const { profile } = await requireActiveStaffSession();

  if (!canManageStaffAccess(profile)) {
    redirect("/dashboard");
  }

  const staffResult = await getStaffManagementProfiles();

  return (
    <RbaAdminClient
      currentStaffId={profile.id}
      dataError={staffResult.error}
      errorMessage={getSearchParam(searchParams, "error")}
      profiles={staffResult.profiles}
      savedMessage={getSearchParam(searchParams, "saved")}
    />
  );
}

function getSearchParam(
  searchParams: RbaPageProps["searchParams"],
  key: string
) {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
