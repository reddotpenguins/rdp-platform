import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateDistanceMeters,
  canApproveLeaveRequest,
  createClockEvent,
  createShift,
  getClockStatus,
  getPayableHours,
  getScheduledHours,
  type LeaveRequest
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
