import { redirect } from "next/navigation";
import { WithdrawalsClient } from "@/components/WithdrawalsClient";
import { canManageStudentLifecycle, getCentreFilterAccess } from "@/lib/staffRoles";
import { getStudentProfiles } from "@/lib/supabase/students";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";

type WithdrawalsPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function WithdrawalsPage({ searchParams }: WithdrawalsPageProps) {
  const { profile } = await requireActiveStaffSession();

  if (!canManageStudentLifecycle(profile)) {
    redirect("/dashboard");
  }

  const studentsResult = await getStudentProfiles();

  return (
    <WithdrawalsClient
      centreFilterAccess={getCentreFilterAccess(profile)}
      dataError={studentsResult.error}
      errorMessage={getSearchParam(searchParams, "error")}
      savedMessage={getSearchParam(searchParams, "saved")}
      students={studentsResult.students}
    />
  );
}

function getSearchParam(
  searchParams: WithdrawalsPageProps["searchParams"],
  key: string
) {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
