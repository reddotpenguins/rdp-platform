import { createClient } from "@/lib/supabase/server";
import type { StudentLifecycleStatus, StudentProfile } from "@/types/studentLifecycle";

type StudentProfileRow = {
  id: string;
  student_name: string;
  parent_name: string | null;
  phone: string | null;
  email: string | null;
  centre_name: string | null;
  coach_name: string | null;
  programme: string | null;
  status: StudentLifecycleStatus;
  start_date: string | null;
  status_effective_date: string | null;
  reason: string | null;
  notes: string | null;
  source_enquiry_id: string | null;
  created_at: string;
  updated_at: string;
};

export type StudentProfilesResult = {
  students: StudentProfile[];
  error?: string;
};

export const studentProfileColumns = [
  "id",
  "student_name",
  "parent_name",
  "phone",
  "email",
  "centre_name",
  "coach_name",
  "programme",
  "status",
  "start_date",
  "status_effective_date",
  "reason",
  "notes",
  "source_enquiry_id",
  "created_at",
  "updated_at"
].join(", ");

export async function getStudentProfiles(): Promise<StudentProfilesResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("student_profiles")
    .select(studentProfileColumns)
    .order("status_effective_date", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(1000);

  if (error) {
    return {
      students: [],
      error: error.message
    };
  }

  return {
    students: ((data ?? []) as unknown as StudentProfileRow[]).map(mapStudentProfile)
  };
}

function mapStudentProfile(row: StudentProfileRow): StudentProfile {
  return {
    id: row.id,
    studentName: row.student_name,
    parentName: row.parent_name,
    phone: row.phone,
    email: row.email,
    centreName: row.centre_name,
    coachName: row.coach_name,
    programme: row.programme,
    status: row.status,
    startDate: row.start_date,
    statusEffectiveDate: row.status_effective_date,
    reason: row.reason,
    notes: row.notes,
    sourceEnquiryId: row.source_enquiry_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
