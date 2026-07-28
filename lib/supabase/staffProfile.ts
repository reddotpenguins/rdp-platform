import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { StaffProfile, StaffRole } from "@/lib/staffRoles";

type StaffProfileRow = {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  coach_name: string | null;
  centre_name: string | null;
  active: boolean;
};

export type StaffSession = {
  user: User;
  profile: StaffProfile;
};

export async function getCurrentStaffSession() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null };
  }

  const { data, error } = await supabase
    .from("staff_profiles")
    .select("id, email, full_name, role, coach_name, centre_name, active")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) {
    return { user, profile: null };
  }

  return {
    user,
    profile: mapStaffProfile(data as StaffProfileRow)
  };
}

export async function requireActiveStaffSession(): Promise<StaffSession> {
  const session = await getCurrentStaffSession();

  if (!session.user) {
    redirect("/login");
  }

  if (!session.profile?.active) {
    redirect("/access-pending");
  }

  return {
    user: session.user,
    profile: session.profile
  };
}

function mapStaffProfile(row: StaffProfileRow): StaffProfile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    coachName: row.coach_name,
    centreName: row.centre_name,
    active: row.active
  };
}
