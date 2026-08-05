import { redirect } from "next/navigation";
import { StudentDashboardClient } from "@/components/StudentDashboardClient";
import {
  canManageCustomerEnquiries,
  canManageStudentLifecycle,
  canViewStudentLifecycle,
  getCentreFilterAccess
} from "@/lib/staffRoles";
import { getCustomerEnquiries } from "@/lib/supabase/enquiries";
import { getStudentProfiles } from "@/lib/supabase/students";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const { profile } = await requireActiveStaffSession();
  const canManageEnquiries = canManageCustomerEnquiries(profile);

  if (!canViewStudentLifecycle(profile)) {
    redirect("/dashboard");
  }

  const studentsResult = await getStudentProfiles();
  const enquiriesResult = canManageEnquiries
    ? await getCustomerEnquiries()
    : { enquiries: [], error: undefined };

  return (
    <StudentDashboardClient
      canManageEnquiries={canManageEnquiries}
      canManageStudentLifecycle={canManageStudentLifecycle(profile)}
      centreFilterAccess={getCentreFilterAccess(profile)}
      enquiries={enquiriesResult.enquiries}
      enquiriesError={enquiriesResult.error}
      students={studentsResult.students}
      studentsError={studentsResult.error}
    />
  );
}
