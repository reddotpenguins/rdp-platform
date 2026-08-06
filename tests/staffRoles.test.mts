import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessClaims,
  canManageStaffAccess,
  canUploadAssessmentData,
  canViewAllAssessments,
  canViewTeamAssessments,
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
    assert.equal(canUploadAssessmentData(admin), true);
    assert.equal(canViewAllAssessments(admin), true);
  });

  it("lets lead coaches view team assessments without staff-management access", () => {
    const leadCoach = buildProfile({
      assignedCentres: ["SJII", "ACSBR"],
      role: "lead_coach"
    });

    assert.equal(canManageStaffAccess(leadCoach), false);
    assert.equal(canViewTeamAssessments(leadCoach), true);
    assert.equal(roleUsesAssignedCentres("lead_coach"), true);
    assert.deepEqual(getCentreFilterAccess(leadCoach), {
      allowAllCentres: true,
      centres: ["SJII", "ACSBR"]
    });
  });

  it("keeps coaches to own assessment and claim creation permissions", () => {
    const coach = buildProfile({ role: "coach" });

    assert.equal(hasStaffPermission(coach, "assessments.viewOwn"), true);
    assert.equal(hasStaffPermission(coach, "claims.create"), true);
    assert.equal(hasStaffPermission(coach, "claims.approve"), false);
    assert.equal(canAccessClaims(coach), true);
    assert.equal(canViewAllAssessments(coach), false);
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
