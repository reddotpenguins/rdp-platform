export type StaffRole = "admin" | "lead_coach" | "coach";

export type StaffProfile = {
  id: string;
  email: string;
  fullName: string;
  role: StaffRole;
  coachName: string | null;
  centreName: string | null;
  assignedCentres: string[];
  active: boolean;
};

export function canUploadAssessmentData(profile: StaffProfile) {
  return profile.role === "admin" || profile.role === "lead_coach";
}

export function formatStaffRole(role: StaffRole) {
  if (role === "lead_coach") {
    return "Lead coach";
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}
