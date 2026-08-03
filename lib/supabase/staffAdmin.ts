import { createClient } from "@/lib/supabase/server";
import type { StaffManagementProfile, StaffRole } from "@/lib/staffRoles";

type StaffProfileAdminRow = {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  coach_name: string | null;
  centre_name: string | null;
  active: boolean;
  created_at: string;
};

type StaffProfileCentreAdminRow = {
  staff_profile_id: string;
  centre_name: string | null;
};

export type StaffManagementResult = {
  profiles: StaffManagementProfile[];
  error?: string;
};

export async function getStaffManagementProfiles(): Promise<StaffManagementResult> {
  const supabase = createClient();
  const { data: staffRows, error: staffError } = await supabase
    .from("staff_profiles")
    .select("id, email, full_name, role, coach_name, centre_name, active, created_at")
    .order("full_name", { ascending: true });

  if (staffError) {
    return {
      profiles: [],
      error: staffError.message
    };
  }

  const { data: centreRows, error: centreError } = await supabase
    .from("staff_profile_centres")
    .select("staff_profile_id, centre_name")
    .order("centre_name", { ascending: true });

  if (centreError) {
    return {
      profiles: [],
      error: centreError.message
    };
  }

  const centresByStaffId = new Map<string, string[]>();

  for (const centreRow of (centreRows ?? []) as StaffProfileCentreAdminRow[]) {
    const centreName = centreRow.centre_name?.trim();

    if (!centreName) {
      continue;
    }

    const centres = centresByStaffId.get(centreRow.staff_profile_id) ?? [];
    centres.push(centreName);
    centresByStaffId.set(centreRow.staff_profile_id, centres);
  }

  return {
    profiles: ((staffRows ?? []) as StaffProfileAdminRow[]).map((row) => ({
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      coachName: row.coach_name,
      centreName: row.centre_name,
      assignedCentres: Array.from(new Set(centresByStaffId.get(row.id) ?? [])),
      active: row.active,
      createdAt: row.created_at
    }))
  };
}
