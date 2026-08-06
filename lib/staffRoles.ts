export type StaffRole = "admin" | "lead_coach" | "coach";

export const staffRoles: StaffRole[] = ["admin", "lead_coach", "coach"];

export const staffPermissions = [
  "users.view",
  "users.create",
  "users.update",
  "users.disable",
  "roles.assign",
  "assessments.create",
  "assessments.viewOwn",
  "assessments.viewTeam",
  "assessments.viewAll",
  "claims.create",
  "claims.viewOwn",
  "claims.review",
  "claims.approve",
  "claims.markPaid",
  "claims.settings.manage",
  "enquiries.assign",
  "students.view",
  "students.manage",
  "reports.view",
  "reports.export",
  "audit.view",
  "settings.manage"
] as const;

export type StaffPermission = (typeof staffPermissions)[number];

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

export type ClaimPermissions = {
  canReview: boolean;
  canManageSettings: boolean;
  canMarkPaid: boolean;
};

const rolePermissionMap: Record<StaffRole, readonly StaffPermission[]> = {
  admin: staffPermissions,
  lead_coach: ["assessments.viewOwn", "assessments.viewTeam"],
  coach: ["assessments.viewOwn"]
};

export function hasRolePermission(role: StaffRole, permission: StaffPermission) {
  return rolePermissionMap[role].includes(permission);
}

export function hasStaffPermission(
  profile: Pick<StaffProfile, "active" | "role">,
  permission: StaffPermission
) {
  return profile.active && hasRolePermission(profile.role, permission);
}

export function hasAnyStaffPermission(
  profile: Pick<StaffProfile, "active" | "role">,
  permissions: StaffPermission[]
) {
  return permissions.some((permission) => hasStaffPermission(profile, permission));
}

export function roleCanManageStaffAccess(role: StaffRole) {
  return hasRolePermission(role, "users.update") && hasRolePermission(role, "roles.assign");
}

export function roleUsesAssignedCentres(role: StaffRole) {
  return hasRolePermission(role, "assessments.viewTeam") && !hasRolePermission(role, "assessments.viewAll");
}

export function canUploadAssessmentData(profile: StaffProfile) {
  return hasStaffPermission(profile, "assessments.create");
}

export function canManageCustomerEnquiries(profile: StaffProfile) {
  return hasStaffPermission(profile, "enquiries.assign");
}

export function canManageStudentLifecycle(profile: StaffProfile) {
  return hasStaffPermission(profile, "students.manage");
}

export function canViewStudentLifecycle(profile: StaffProfile) {
  return hasStaffPermission(profile, "students.view");
}

export function canManageStaffAccess(profile: StaffProfile) {
  return profile.active && roleCanManageStaffAccess(profile.role);
}

export function canAccessClaims(profile: StaffProfile) {
  return hasAnyStaffPermission(profile, ["claims.create", "claims.viewOwn", "claims.review"]);
}

export function canViewQuarterAssessmentDashboard(profile: StaffProfile) {
  return canViewAllAssessments(profile);
}

export function getClaimPermissions(role: StaffRole): ClaimPermissions {
  return {
    canReview: hasRolePermission(role, "claims.review"),
    canManageSettings: hasRolePermission(role, "claims.settings.manage"),
    canMarkPaid: hasRolePermission(role, "claims.markPaid")
  };
}

export function canViewAdminHome(profile: StaffProfile) {
  return hasAnyStaffPermission(profile, [
    "users.view",
    "assessments.create",
    "enquiries.assign",
    "students.view",
    "settings.manage"
  ]);
}

export function canViewAllAssessments(profile: StaffProfile) {
  return hasStaffPermission(profile, "assessments.viewAll");
}

export function canViewTeamAssessments(profile: StaffProfile) {
  return hasStaffPermission(profile, "assessments.viewTeam");
}

export function getCentreFilterAccess(profile: StaffProfile): CentreFilterAccess {
  if (!canViewTeamAssessments(profile)) {
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
