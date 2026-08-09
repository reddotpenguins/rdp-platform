import type { StaffProfile, StaffRole } from "@/lib/staffRoles";

export type ScheduleShiftStatus = "scheduled" | "completed" | "covered" | "cancelled";
export type ClockLocationStatus = "inside_geofence" | "outside_geofence" | "location_unavailable";
export type LeaveRequestStatus = "draft" | "pending" | "approved" | "rejected";
export type LessonPlanMode = "text" | "document";

export type GeoPoint = {
  accuracyMeters?: number;
  latitude: number;
  longitude: number;
};

export type CentreLocation = GeoPoint & {
  centreName: string;
  geofenceRadiusMeters: number;
};

export type ScheduledShift = {
  centreName: string;
  coachName: string;
  date: string;
  endTime: string;
  expectedLocation: CentreLocation;
  id: string;
  programme: string;
  sessionLabel: string;
  staffId: string;
  staffRole: StaffRole;
  startTime: string;
  status: ScheduleShiftStatus;
};

export type ClockEvent = GeoPoint & {
  at: string;
  distanceMeters: number | null;
  locationStatus: ClockLocationStatus;
};

export type AttendanceRecord = {
  clockIn: ClockEvent | null;
  clockOut: ClockEvent | null;
  id: string;
  shiftId: string;
  staffId: string;
};

export type LeaveRequest = {
  coverCoachConfirmed: boolean;
  coverCoachId: string;
  coverCoachName: string;
  createdAt: string;
  documentName: string;
  id: string;
  lessonPlanMode: LessonPlanMode;
  lessonPlanText: string;
  reason: string;
  reviewedAt: string | null;
  reviewerNote: string;
  shiftId: string;
  staffId: string;
  status: LeaveRequestStatus;
};

export type SchedulingState = {
  attendance: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  shifts: ScheduledShift[];
};

export type PayrollRow = {
  centreName: string;
  clockStatus: ClockLocationStatus | "not_clocked";
  coachName: string;
  date: string;
  payableHours: number;
  scheduledHours: number;
  shiftId: string;
};

export const defaultGeofenceRadiusMeters = 150;

export const centreLocations: CentreLocation[] = [
  {
    centreName: "SAAC",
    geofenceRadiusMeters: defaultGeofenceRadiusMeters,
    latitude: 1.3521,
    longitude: 103.8198
  },
  {
    centreName: "SJII",
    geofenceRadiusMeters: defaultGeofenceRadiusMeters,
    latitude: 1.3264,
    longitude: 103.8362
  },
  {
    centreName: "ACSBR",
    geofenceRadiusMeters: defaultGeofenceRadiusMeters,
    latitude: 1.3194,
    longitude: 103.8353
  },
  {
    centreName: "YMCA",
    geofenceRadiusMeters: defaultGeofenceRadiusMeters,
    latitude: 1.2989,
    longitude: 103.8475
  }
];

const sampleStaff = [
  {
    id: "lead-jim",
    name: "Jim",
    role: "lead_coach" as const
  },
  {
    id: "lead-taro",
    name: "Taro",
    role: "lead_coach" as const
  },
  {
    id: "coach-julia",
    name: "Julia",
    role: "coach" as const
  },
  {
    id: "coach-carmen",
    name: "Carmen",
    role: "coach" as const
  }
];

export function createInitialSchedulingState(staffProfile: StaffProfile, now = new Date()): SchedulingState {
  const currentStaffName = getStaffDisplayName(staffProfile);
  const today = toDateInputValue(now);
  const tomorrow = toDateInputValue(addDays(now, 1));
  const yesterday = toDateInputValue(addDays(now, -1));
  const currentCentre = staffProfile.centreName || staffProfile.assignedCentres[0] || "SAAC";
  const currentStaffShift = createShift({
    centreName: currentCentre,
    coachName: currentStaffName,
    date: today,
    endTime: "10:30",
    id: "shift-current-staff-today",
    programme: "Learn to Swim",
    sessionLabel: "Saturday AM",
    staffId: staffProfile.id,
    staffRole: staffProfile.role,
    startTime: "08:00"
  });

  const shifts = [
    currentStaffShift,
    createShift({
      centreName: currentCentre,
      coachName: currentStaffName,
      date: tomorrow,
      endTime: "17:30",
      id: "shift-current-staff-tomorrow",
      programme: "Learn to Swim",
      sessionLabel: "Sunday PM",
      staffId: staffProfile.id,
      staffRole: staffProfile.role,
      startTime: "15:00"
    }),
    createShift({
      centreName: "SAAC",
      coachName: sampleStaff[0].name,
      date: today,
      endTime: "12:30",
      id: "shift-jim-saac-am",
      programme: "Learn to Swim",
      sessionLabel: "Saturday AM",
      staffId: sampleStaff[0].id,
      staffRole: sampleStaff[0].role,
      startTime: "08:00"
    }),
    createShift({
      centreName: "ACSBR",
      coachName: sampleStaff[1].name,
      date: today,
      endTime: "18:00",
      id: "shift-taro-acsbr-pm",
      programme: "Race Team",
      sessionLabel: "Saturday PM",
      staffId: sampleStaff[1].id,
      staffRole: sampleStaff[1].role,
      startTime: "14:30"
    }),
    createShift({
      centreName: "YMCA",
      coachName: sampleStaff[2].name,
      date: yesterday,
      endTime: "11:00",
      id: "shift-julia-ymca-yesterday",
      programme: "Baby Class",
      sessionLabel: "Sunday AM",
      staffId: sampleStaff[2].id,
      staffRole: sampleStaff[2].role,
      startTime: "08:30",
      status: "completed"
    }),
    createShift({
      centreName: "SAAC",
      coachName: sampleStaff[3].name,
      date: tomorrow,
      endTime: "18:00",
      id: "shift-carmen-saac-cover",
      programme: "Learn to Swim",
      sessionLabel: "Sunday PM",
      staffId: sampleStaff[3].id,
      staffRole: sampleStaff[3].role,
      startTime: "15:00"
    })
  ];

  return {
    attendance: [
      {
        clockIn: createClockEvent(shifts[4].expectedLocation, shifts[4].expectedLocation, `${yesterday}T08:24:00+08:00`),
        clockOut: createClockEvent(shifts[4].expectedLocation, shifts[4].expectedLocation, `${yesterday}T11:08:00+08:00`),
        id: "attendance-julia-yesterday",
        shiftId: shifts[4].id,
        staffId: shifts[4].staffId
      }
    ],
    leaveRequests: [
      {
        coverCoachConfirmed: true,
        coverCoachId: sampleStaff[3].id,
        coverCoachName: sampleStaff[3].name,
        createdAt: `${today}T09:30:00+08:00`,
        documentName: "sunday-pm-lesson-plan.pdf",
        id: "leave-jim-demo",
        lessonPlanMode: "document",
        lessonPlanText: "",
        reason: "Family matter",
        reviewedAt: null,
        reviewerNote: "",
        shiftId: shifts[2].id,
        staffId: shifts[2].staffId,
        status: "pending"
      }
    ],
    shifts
  };
}

export function createShift(values: Omit<ScheduledShift, "expectedLocation" | "status"> & { status?: ScheduleShiftStatus }): ScheduledShift {
  return {
    ...values,
    expectedLocation: getCentreLocation(values.centreName),
    status: values.status ?? "scheduled"
  };
}

export function getCentreLocation(centreName: string) {
  return (
    centreLocations.find((location) => location.centreName.toLowerCase() === centreName.toLowerCase()) ??
    centreLocations[0]
  );
}

export function createClockEvent(location: GeoPoint | null, expectedLocation: CentreLocation, at = new Date().toISOString()): ClockEvent {
  if (!location) {
    return {
      at,
      distanceMeters: null,
      latitude: expectedLocation.latitude,
      longitude: expectedLocation.longitude,
      locationStatus: "location_unavailable"
    };
  }

  const distanceMeters = calculateDistanceMeters(location, expectedLocation);

  return {
    accuracyMeters: location.accuracyMeters,
    at,
    distanceMeters,
    latitude: location.latitude,
    longitude: location.longitude,
    locationStatus: distanceMeters <= expectedLocation.geofenceRadiusMeters ? "inside_geofence" : "outside_geofence"
  };
}

export function calculateDistanceMeters(first: GeoPoint, second: GeoPoint) {
  const earthRadiusMeters = 6371000;
  const firstLat = toRadians(first.latitude);
  const secondLat = toRadians(second.latitude);
  const deltaLat = toRadians(second.latitude - first.latitude);
  const deltaLng = toRadians(second.longitude - first.longitude);
  const value =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(firstLat) *
      Math.cos(secondLat) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  const centralAngle = 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));

  return Math.round(earthRadiusMeters * centralAngle);
}

export function getScheduledHours(shift: Pick<ScheduledShift, "date" | "endTime" | "startTime">) {
  const start = Date.parse(`${shift.date}T${shift.startTime}:00+08:00`);
  const end = Date.parse(`${shift.date}T${shift.endTime}:00+08:00`);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }

  return roundHours((end - start) / 1000 / 60 / 60);
}

export function getPayableHours(attendance: AttendanceRecord | undefined, shift: ScheduledShift) {
  if (!attendance?.clockIn || !attendance.clockOut) {
    return 0;
  }

  const clockIn = Date.parse(attendance.clockIn.at);
  const clockOut = Date.parse(attendance.clockOut.at);

  if (!Number.isFinite(clockIn) || !Number.isFinite(clockOut) || clockOut <= clockIn) {
    return 0;
  }

  return Math.min(getScheduledHours(shift), roundHours((clockOut - clockIn) / 1000 / 60 / 60));
}

export function getClockStatus(attendance: AttendanceRecord | undefined): ClockLocationStatus | "not_clocked" {
  if (!attendance?.clockIn) {
    return "not_clocked";
  }

  if (attendance.clockIn.locationStatus === "outside_geofence" || attendance.clockOut?.locationStatus === "outside_geofence") {
    return "outside_geofence";
  }

  if (
    attendance.clockIn.locationStatus === "location_unavailable" ||
    attendance.clockOut?.locationStatus === "location_unavailable"
  ) {
    return "location_unavailable";
  }

  return "inside_geofence";
}

export function buildPayrollRows(shifts: ScheduledShift[], attendance: AttendanceRecord[]): PayrollRow[] {
  return shifts.map((shift) => {
    const record = attendance.find((item) => item.shiftId === shift.id);

    return {
      centreName: shift.centreName,
      clockStatus: getClockStatus(record),
      coachName: shift.coachName,
      date: shift.date,
      payableHours: getPayableHours(record, shift),
      scheduledHours: getScheduledHours(shift),
      shiftId: shift.id
    };
  });
}

export function canApproveLeaveRequest(request: LeaveRequest) {
  return request.status === "pending" && request.coverCoachConfirmed && hasLessonPlan(request);
}

export function hasLessonPlan(request: Pick<LeaveRequest, "documentName" | "lessonPlanMode" | "lessonPlanText">) {
  return request.lessonPlanMode === "document"
    ? Boolean(request.documentName.trim())
    : request.lessonPlanText.trim().length >= 20;
}

export function getLeaveReadinessLabel(request: LeaveRequest) {
  if (!request.coverCoachConfirmed && !hasLessonPlan(request)) {
    return "Needs cover confirmation and lesson plan";
  }

  if (!request.coverCoachConfirmed) {
    return "Needs cover confirmation";
  }

  if (!hasLessonPlan(request)) {
    return "Needs lesson plan";
  }

  return "Ready for approval";
}

export function getStaffDisplayName(staffProfile: Pick<StaffProfile, "coachName" | "email" | "fullName">) {
  return staffProfile.fullName || staffProfile.coachName || staffProfile.email;
}

export function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}
