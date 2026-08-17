import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/DashboardClient";
import {
  canManageCustomerEnquiries,
  canManageStudentLifecycle,
  canManageStaffAccess,
  canAccessScheduling,
  canViewAuditLog,
  canViewStudentLifecycle,
  canViewTrainingResources,
  canViewQuarterAssessmentDashboard,
  canUploadAssessmentData,
  getCentreFilterAccess
} from "@/lib/staffRoles";
import { getInitialAssessmentDataset } from "@/lib/supabase/assessmentData";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";

export default async function QuarterDashboardPage() {
  const { profile } = await requireActiveStaffSession();

  if (!canViewQuarterAssessmentDashboard(profile)) {
    redirect("/dashboard");
  }

  const dataset = await getInitialAssessmentDataset(profile);

  return (
    <DashboardClient
      initialRecords={dataset.records}
      canAccessScheduling={canAccessScheduling(profile)}
      canUpload={canUploadAssessmentData(profile)}
      canManageEnquiries={canManageCustomerEnquiries(profile)}
      canManageStaff={canManageStaffAccess(profile)}
      canManageStudentLifecycle={canManageStudentLifecycle(profile)}
      canViewAuditLog={canViewAuditLog(profile)}
      canViewStudentLifecycle={canViewStudentLifecycle(profile)}
      canViewTrainingResources={canViewTrainingResources(profile)}
      centreFilterAccess={getCentreFilterAccess(profile)}
      view="quarter"
    />
  );
}
