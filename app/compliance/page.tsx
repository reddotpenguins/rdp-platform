import { redirect } from "next/navigation";
import { ComplianceLogClient } from "@/components/ComplianceLogClient";
import { canViewAuditLog } from "@/lib/staffRoles";
import { getComplianceLogEntries } from "@/lib/supabase/complianceLog";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";

type CompliancePageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function CompliancePage({ searchParams }: CompliancePageProps) {
  const { profile } = await requireActiveStaffSession();

  if (!canViewAuditLog(profile)) {
    redirect("/dashboard");
  }

  const result = await getComplianceLogEntries();
  const error = getSearchParam(searchParams, "error");
  const message = getSearchParam(searchParams, "message");

  return (
    <ComplianceLogClient
      dataError={result.error}
      entries={result.entries}
      flash={
        error ? { text: error, tone: "error" } : message ? { text: message, tone: "success" } : null
      }
      staffProfile={profile}
    />
  );
}

function getSearchParam(
  searchParams: CompliancePageProps["searchParams"],
  key: string
) {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
