import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateDistanceMeters,
  canApproveLeaveRequest,
  createClockEvent,
  createShift,
  detectScheduleConflicts,
  getClockStatus,
  getRosterShiftHours,
  getPayableHours,
  getScheduledHours,
  getWeekStartDate,
  type LeaveRequest,
  type RosterShift
} from "../lib/scheduling.ts";

describe("scheduling geofence checks", () => {
  it("marks clock events inside or outside the centre geofence", () => {
    const expectedLocation = {
      centreName: "Test Centre",
      geofenceRadiusMeters: 150,
      latitude: 1.3,
      longitude: 103.8
    };

    const inside = createClockEvent({ latitude: 1.3001, longitude: 103.8001 }, expectedLocation);
    const outside = createClockEvent({ latitude: 1.31, longitude: 103.81 }, expectedLocation);

    assert.equal(inside.locationStatus, "inside_geofence");
    assert.equal(outside.locationStatus, "outside_geofence");
    assert.equal(calculateDistanceMeters(expectedLocation, expectedLocation), 0);
  });

  it("summarizes location status from clock-in and clock-out", () => {
    const expectedLocation = {
      centreName: "Test Centre",
      geofenceRadiusMeters: 150,
      latitude: 1.3,
      longitude: 103.8
    };

    assert.equal(
      getClockStatus({
        clockIn: createClockEvent({ latitude: 1.3, longitude: 103.8 }, expectedLocation),
        clockOut: createClockEvent({ latitude: 1.31, longitude: 103.81 }, expectedLocation),
        id: "attendance-1",
        shiftId: "shift-1",
        staffId: "staff-1"
      }),
      "outside_geofence"
    );
  });
});

describe("scheduling payroll calculations", () => {
  it("caps payable hours at scheduled shift hours", () => {
    const shift = createShift({
      centreName: "SAAC",
      coachName: "Coach",
      date: "2026-08-09",
      endTime: "10:00",
      id: "shift-1",
      programme: "Learn to Swim",
      sessionLabel: "Sunday AM",
      staffId: "staff-1",
      staffRole: "coach",
      startTime: "08:00"
    });

    assert.equal(getScheduledHours(shift), 2);
    assert.equal(
      getPayableHours(
        {
          clockIn: createClockEvent(shift.expectedLocation, shift.expectedLocation, "2026-08-09T07:50:00+08:00"),
          clockOut: createClockEvent(shift.expectedLocation, shift.expectedLocation, "2026-08-09T10:15:00+08:00"),
          id: "attendance-1",
          shiftId: shift.id,
          staffId: "staff-1"
        },
        shift
      ),
      2
    );
  });

  it("handles overnight scheduled shifts", () => {
    const shift = createShift({
      centreName: "Dhoby Ghaut",
      coachName: "Coach",
      date: "2026-08-09",
      endTime: "01:00",
      id: "shift-overnight",
      programme: "Operations",
      sessionLabel: "Overnight",
      staffId: "staff-1",
      staffRole: "coach",
      startTime: "23:00"
    });

    assert.equal(getScheduledHours(shift), 2);
  });
});

describe("schedule week and conflict helpers", () => {
  it("normalizes any date to a Monday week start", () => {
    assert.equal(getWeekStartDate("2026-08-09"), "2026-08-03");
    assert.equal(getWeekStartDate("2026-08-10"), "2026-08-10");
  });

  it("detects under-staffing, overlap, and missing qualifications", () => {
    const shifts = [
      buildRosterShift({
        assignments: [
          {
            id: "assignment-1",
            qualificationIds: [],
            staffName: "Coach A",
            staffProfileId: "staff-1",
            staffRole: "coach",
            status: "assigned"
          }
        ],
        endsAt: "2026-08-09T02:00:00.000Z",
        id: "shift-1",
        requiredQualificationId: "qualification-1",
        requiredQualificationName: "LTS",
        startsAt: "2026-08-09T00:00:00.000Z"
      }),
      buildRosterShift({
        assignments: [
          {
            id: "assignment-2",
            qualificationIds: ["qualification-1"],
            staffName: "Coach A",
            staffProfileId: "staff-1",
            staffRole: "coach",
            status: "assigned"
          }
        ],
        endsAt: "2026-08-09T03:30:00.000Z",
        id: "shift-2",
        startsAt: "2026-08-09T01:30:00.000Z"
      }),
      buildRosterShift({
        assignments: [],
        id: "shift-3",
        requiredManpower: 2
      })
    ];
    const warnings = detectScheduleConflicts(shifts);

    assert.equal(getRosterShiftHours(shifts[0]), 2);
    assert.ok(warnings.some((warning) => warning.id === "qualification-shift-1-staff-1"));
    assert.ok(warnings.some((warning) => warning.id === "overlap-staff-1-shift-1-shift-2"));
    assert.ok(warnings.some((warning) => warning.id === "understaffed-shift-3"));
  });
});

describe("leave approval readiness", () => {
  it("requires cover confirmation and a lesson plan", () => {
    const request = buildLeaveRequest({
      coverCoachConfirmed: true,
      lessonPlanMode: "text",
      lessonPlanText: "Warm-up, safety briefing, skill progression, and closing review."
    });

    assert.equal(canApproveLeaveRequest(request), true);
    assert.equal(canApproveLeaveRequest({ ...request, coverCoachConfirmed: false }), false);
    assert.equal(canApproveLeaveRequest({ ...request, lessonPlanText: "" }), false);
  });
});

function buildLeaveRequest(overrides: Partial<LeaveRequest>): LeaveRequest {
  return {
    coverCoachConfirmed: false,
    coverCoachId: "cover-1",
    coverCoachName: "Cover Coach",
    createdAt: "2026-08-09T00:00:00.000Z",
    documentName: "",
    id: "leave-1",
    lessonPlanMode: "text",
    lessonPlanText: "",
    reason: "Leave",
    reviewedAt: null,
    reviewerNote: "",
    shiftId: "shift-1",
    staffId: "staff-1",
    status: "pending",
    ...overrides
  };
}

function buildRosterShift(overrides: Partial<RosterShift>): RosterShift {
  return {
    assignments: [],
    colour: "#f26a2e",
    departmentId: null,
    departmentName: null,
    endsAt: "2026-08-09T02:00:00.000Z",
    id: "shift",
    locationName: "Dhoby Ghaut",
    notes: null,
    programmeId: null,
    programmeName: null,
    requiredManpower: 1,
    requiredQualificationId: null,
    requiredQualificationName: null,
    requiredRole: null,
    scheduleWeekId: "week-1",
    sessionLabel: null,
    startsAt: "2026-08-09T00:00:00.000Z",
    status: "draft",
    title: "Shift",
    workLocationId: null,
    ...overrides
  };
}
