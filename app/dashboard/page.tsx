import { DashboardClient } from "@/components/DashboardClient";
import {
  canManageCustomerEnquiries,
  canManageStudentLifecycle,
  canManageStaffAccess,
  canViewStudentLifecycle,
  canUploadAssessmentData,
  getCentreFilterAccess
} from "@/lib/staffRoles";
import { getInitialAssessmentDataset } from "@/lib/supabase/assessmentData";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { profile } = await requireActiveStaffSession();
  const dataset = await getInitialAssessmentDataset(profile);

  return (
    <DashboardClient
      initialRecords={dataset.records}
      canUpload={canUploadAssessmentData(profile)}
      canManageEnquiries={canManageCustomerEnquiries(profile)}
      canManageStaff={canManageStaffAccess(profile)}
      canManageStudentLifecycle={canManageStudentLifecycle(profile)}
      canViewStudentLifecycle={canViewStudentLifecycle(profile)}
      centreFilterAccess={getCentreFilterAccess(profile)}
      view="coach"
    />
  );
}
