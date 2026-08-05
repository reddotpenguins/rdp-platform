export type StaffRole = "admin" | "lead_coach" | "coach";

export const staffRoles: StaffRole[] = ["admin", "lead_coach", "coach"];

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

export type StaffManagementProfile = StaffProfile & {
  createdAt: string;
};

export type CentreFilterAccess = {
  allowAllCentres: boolean;
  centres: string[];
};

export function canUploadAssessmentData(profile: StaffProfile) {
  return profile.role === "admin" || profile.role === "lead_coach";
}

export function canManageCustomerEnquiries(profile: StaffProfile) {
  return profile.role === "admin";
}

export function canManageStudentLifecycle(profile: StaffProfile) {
  return profile.role === "admin";
}

export function canViewStudentLifecycle(profile: StaffProfile) {
  return profile.role === "admin" || profile.role === "lead_coach" || profile.role === "coach";
}

export function getCentreFilterAccess(profile: StaffProfile): CentreFilterAccess {
  if (profile.role !== "lead_coach") {
    return {
      allowAllCentres: true,
      centres: []
    };
  }

  return {
    allowAllCentres: profile.assignedCentres.length !== 1,
    centres: profile.assignedCentres
  };
}

export function formatStaffRole(role: StaffRole) {
  if (role === "lead_coach") {
    return "Lead coach";
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function isStaffRole(value: string): value is StaffRole {
  return staffRoles.includes(value as StaffRole);
}
