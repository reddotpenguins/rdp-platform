import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessClaims,
  canAccessScheduling,
  canManageStaffAccess,
  canManageScheduling,
  canManageTrainingResources,
  canUploadAssessmentData,
  canViewAllAssessments,
  canViewQuarterAssessmentDashboard,
  canViewTeamAssessments,
  canViewTrainingDepartment,
  canViewTrainingResources,
  getCentreFilterAccess,
  hasStaffPermission,
  roleCanManageStaffAccess,
  roleUsesAssignedCentres,
  type StaffProfile
} from "../lib/staffRoles.ts";

describe("staff permission model", () => {
  it("keeps admin operations behind explicit permissions", () => {
    const admin = buildProfile({ role: "admin" });

    assert.equal(canManageStaffAccess(admin), true);
    assert.equal(roleCanManageStaffAccess("admin"), true);
    assert.equal(canAccessClaims(admin), true);
    assert.equal(canAccessScheduling(admin), true);
    assert.equal(canManageScheduling(admin), true);
    assert.equal(canUploadAssessmentData(admin), true);
    assert.equal(canViewAllAssessments(admin), true);
    assert.equal(canViewQuarterAssessmentDashboard(admin), true);
    assert.equal(canViewTrainingDepartment(admin), true);
    assert.equal(canViewTrainingResources(admin), true);
    assert.equal(canManageTrainingResources(admin), true);
  });

  it("lets lead coaches view team assessments without staff-management access", () => {
    const leadCoach = buildProfile({
      assignedCentres: ["SJII", "ACSBR"],
      role: "lead_coach"
    });

    assert.equal(canManageStaffAccess(leadCoach), false);
    assert.equal(canAccessClaims(leadCoach), false);
    assert.equal(canAccessScheduling(leadCoach), false);
    assert.equal(canManageScheduling(leadCoach), false);
    assert.equal(canViewTeamAssessments(leadCoach), true);
    assert.equal(canViewTrainingDepartment(leadCoach), false);
    assert.equal(canViewTrainingResources(leadCoach), true);
    assert.equal(canManageTrainingResources(leadCoach), false);
    assert.equal(canViewQuarterAssessmentDashboard(leadCoach), false);
    assert.equal(roleUsesAssignedCentres("lead_coach"), true);
    assert.deepEqual(getCentreFilterAccess(leadCoach), {
      allowAllCentres: true,
      centres: ["SJII", "ACSBR"]
    });
  });

  it("keeps coaches to the coach assessment dashboard only", () => {
    const coach = buildProfile({ role: "coach" });

    assert.equal(hasStaffPermission(coach, "assessments.viewOwn"), true);
    assert.equal(hasStaffPermission(coach, "claims.create"), false);
    assert.equal(hasStaffPermission(coach, "claims.approve"), false);
    assert.equal(canAccessClaims(coach), false);
    assert.equal(canAccessScheduling(coach), false);
    assert.equal(canManageScheduling(coach), false);
    assert.equal(canViewAllAssessments(coach), false);
    assert.equal(canViewQuarterAssessmentDashboard(coach), false);
    assert.equal(canViewTrainingDepartment(coach), false);
    assert.equal(canViewTrainingResources(coach), true);
    assert.equal(canManageTrainingResources(coach), false);
  });

  it("rejects permissions for inactive staff", () => {
    const inactiveAdmin = buildProfile({ active: false, role: "admin" });

    assert.equal(canManageStaffAccess(inactiveAdmin), false);
    assert.equal(hasStaffPermission(inactiveAdmin, "settings.manage"), false);
  });
});

function buildProfile(overrides: Partial<StaffProfile>): StaffProfile {
  return {
    active: true,
    assignedCentres: [],
    centreName: null,
    coachName: "Coach",
    email: "coach@example.com",
    fullName: "Coach",
    id: "staff-1",
    role: "coach",
    ...overrides
  };
}
