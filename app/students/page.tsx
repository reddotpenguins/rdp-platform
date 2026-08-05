import { redirect } from "next/navigation";
import { StudentDashboardClient } from "@/components/StudentDashboardClient";
import { canManageStudentLifecycle, getCentreFilterAccess } from "@/lib/staffRoles";
import { getCustomerEnquiries } from "@/lib/supabase/enquiries";
import { getStudentProfiles } from "@/lib/supabase/students";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const { profile } = await requireActiveStaffSession();

  if (!canManageStudentLifecycle(profile)) {
    redirect("/dashboard");
  }

  const [studentsResult, enquiriesResult] = await Promise.all([
    getStudentProfiles(),
    getCustomerEnquiries()
  ]);

  return (
    <StudentDashboardClient
      centreFilterAccess={getCentreFilterAccess(profile)}
      enquiries={enquiriesResult.enquiries}
      enquiriesError={enquiriesResult.error}
      students={studentsResult.students}
      studentsError={studentsResult.error}
    />
  );
}
