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

export type ScheduleWeekStatus = "draft" | "published" | "completed" | "cancelled";
export type ScheduleAssignmentStatus = "assigned" | "acknowledged" | "declined" | "removed";
export type ScheduleConflictSeverity = "warning" | "error";

export type ScheduleResourceOption = {
  active: boolean;
  id: string;
  name: string;
  sortOrder: number;
};

export type ScheduleWorkLocation = ScheduleResourceOption & {
  geofenceRadiusMeters: number;
  latitude: number | null;
  longitude: number | null;
  shortName: string | null;
};

export type ScheduleStaffOption = {
  active: boolean;
  assignedCentres: string[];
  centreName: string | null;
  coachName: string | null;
  email: string;
  fullName: string;
  id: string;
  qualificationIds: string[];
  role: StaffRole;
};

export type RosterAssignment = {
  id: string;
  qualificationIds: string[];
  staffName: string;
  staffProfileId: string;
  staffRole: StaffRole;
  status: ScheduleAssignmentStatus;
};

export type RosterShift = {
  assignments: RosterAssignment[];
  colour: string;
  departmentId: string | null;
  departmentName: string | null;
  endsAt: string;
  id: string;
  locationName: string | null;
  notes: string | null;
  programmeId: string | null;
  programmeName: string | null;
  requiredManpower: number;
  requiredQualificationId: string | null;
  requiredQualificationName: string | null;
  requiredRole: StaffRole | null;
  scheduleWeekId: string;
  sessionLabel: string | null;
  startsAt: string;
  status: ScheduleWeekStatus;
  title: string;
  workLocationId: string | null;
};

export type ScheduleWeek = {
  id: string | null;
  notes: string | null;
  publishedAt: string | null;
  status: ScheduleWeekStatus;
  weekStartDate: string;
};

export type ScheduleTemplate = {
  active: boolean;
  description: string | null;
  id: string;
  name: string;
};

export type ScheduleConflictWarning = {
  id: string;
  message: string;
  severity: ScheduleConflictSeverity;
  shiftId: string | null;
};

export type ScheduleConflictOptions = {
  dailyHourLimit?: number;
  minimumRestHours?: number;
  weeklyHourLimit?: number;
};

export const defaultGeofenceRadiusMeters = 150;
export const singaporeTimeZone = "Asia/Singapore";
export const defaultDailyHourLimit = 8;
export const defaultWeeklyHourLimit = 44;
export const defaultMinimumRestHours = 10;

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
  let end = Date.parse(`${shift.date}T${shift.endTime}:00+08:00`);

  if (Number.isFinite(start) && Number.isFinite(end) && end <= start) {
    end += 24 * 60 * 60 * 1000;
  }

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

export function todayInSingapore() {
  return formatDateInSingapore(new Date());
}

export function getWeekStartDate(value = todayInSingapore()) {
  const date = parseIsoDateAsUtc(value);
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);

  return formatUtcDate(date);
}

export function addDaysToIsoDate(value: string, days: number) {
  const date = parseIsoDateAsUtc(value);
  date.setUTCDate(date.getUTCDate() + days);

  return formatUtcDate(date);
}

export function buildWeekDays(weekStartDate: string) {
  return Array.from({ length: 7 }, (_, index) => addDaysToIsoDate(weekStartDate, index));
}

export function parseSingaporeShiftRange(date: string, startTime: string, endTime: string) {
  const startsAt = Date.parse(`${date}T${startTime}:00+08:00`);
  let endsAt = Date.parse(`${date}T${endTime}:00+08:00`);

  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) {
    throw new Error("Use a valid date, start time, and end time.");
  }

  if (endsAt <= startsAt) {
    endsAt += 24 * 60 * 60 * 1000;
  }

  return {
    endsAt: new Date(endsAt).toISOString(),
    startsAt: new Date(startsAt).toISOString()
  };
}

export function getRosterShiftHours(shift: Pick<RosterShift, "endsAt" | "startsAt">) {
  const startsAt = Date.parse(shift.startsAt);
  const endsAt = Date.parse(shift.endsAt);

  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) {
    return 0;
  }

  return roundHours((endsAt - startsAt) / 1000 / 60 / 60);
}

export function getShiftSingaporeDate(value: string) {
  return formatDateInSingapore(new Date(value));
}

export function getShiftSingaporeTime(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: singaporeTimeZone
  }).format(new Date(value));
}

export function getShiftTimeRangeLabel(shift: Pick<RosterShift, "endsAt" | "startsAt">) {
  return `${getShiftSingaporeTime(shift.startsAt)}-${getShiftSingaporeTime(shift.endsAt)}`;
}

export function getScheduleWeekLabel(weekStartDate: string) {
  const weekEndDate = addDaysToIsoDate(weekStartDate, 6);

  return `${formatShortDate(weekStartDate)} to ${formatShortDate(weekEndDate)}`;
}

export function detectScheduleConflicts(
  shifts: RosterShift[],
  options: ScheduleConflictOptions = {}
): ScheduleConflictWarning[] {
  const warnings: ScheduleConflictWarning[] = [];
  const dailyHourLimit = options.dailyHourLimit ?? defaultDailyHourLimit;
  const weeklyHourLimit = options.weeklyHourLimit ?? defaultWeeklyHourLimit;
  const minimumRestHours = options.minimumRestHours ?? defaultMinimumRestHours;
  const activeShifts = shifts.filter((shift) => shift.status !== "cancelled");
  const shiftsByStaff = new Map<string, Array<{ shift: RosterShift; assignment: RosterAssignment }>>();

  activeShifts.forEach((shift) => {
    if (shift.assignments.length < shift.requiredManpower) {
      warnings.push({
        id: `understaffed-${shift.id}`,
        message: `${shift.title} needs ${shift.requiredManpower} staff but has ${shift.assignments.length}.`,
        severity: "warning",
        shiftId: shift.id
      });
    }

    shift.assignments.forEach((assignment) => {
      if (shift.requiredRole && assignment.staffRole !== shift.requiredRole) {
        warnings.push({
          id: `role-${shift.id}-${assignment.staffProfileId}`,
          message: `${assignment.staffName} is assigned as ${formatStaffRoleForSchedule(assignment.staffRole)}, but this shift requires ${formatStaffRoleForSchedule(shift.requiredRole)}.`,
          severity: "warning",
          shiftId: shift.id
        });
      }

      if (
        shift.requiredQualificationId &&
        !assignment.qualificationIds.includes(shift.requiredQualificationId)
      ) {
        warnings.push({
          id: `qualification-${shift.id}-${assignment.staffProfileId}`,
          message: `${assignment.staffName} is missing ${shift.requiredQualificationName ?? "the required qualification"}.`,
          severity: "warning",
          shiftId: shift.id
        });
      }

      const staffShifts = shiftsByStaff.get(assignment.staffProfileId) ?? [];
      staffShifts.push({ assignment, shift });
      shiftsByStaff.set(assignment.staffProfileId, staffShifts);
    });
  });

  shiftsByStaff.forEach((staffShifts, staffProfileId) => {
    const sorted = staffShifts
      .slice()
      .sort((first, second) => Date.parse(first.shift.startsAt) - Date.parse(second.shift.startsAt));
    const staffName = sorted[0]?.assignment.staffName ?? "Staff";
    const hoursByDate = new Map<string, number>();
    let weeklyHours = 0;

    sorted.forEach(({ shift }) => {
      const shiftHours = getRosterShiftHours(shift);
      const shiftDate = getShiftSingaporeDate(shift.startsAt);
      weeklyHours += shiftHours;
      hoursByDate.set(shiftDate, roundHours((hoursByDate.get(shiftDate) ?? 0) + shiftHours));
    });

    hoursByDate.forEach((hours, date) => {
      if (hours > dailyHourLimit) {
        warnings.push({
          id: `daily-hours-${staffProfileId}-${date}`,
          message: `${staffName} has ${hours.toFixed(2)} scheduled hours on ${date}.`,
          severity: "warning",
          shiftId: null
        });
      }
    });

    if (weeklyHours > weeklyHourLimit) {
      warnings.push({
        id: `weekly-hours-${staffProfileId}`,
        message: `${staffName} has ${weeklyHours.toFixed(2)} scheduled hours this week.`,
        severity: "warning",
        shiftId: null
      });
    }

    for (let index = 0; index < sorted.length; index += 1) {
      const current = sorted[index];
      const next = sorted[index + 1];

      if (!next) {
        continue;
      }

      const currentStart = Date.parse(current.shift.startsAt);
      const currentEnd = Date.parse(current.shift.endsAt);
      const nextStart = Date.parse(next.shift.startsAt);

      if (currentEnd > nextStart) {
        warnings.push({
          id: `overlap-${staffProfileId}-${current.shift.id}-${next.shift.id}`,
          message: `${staffName} has overlapping shifts: ${current.shift.title} and ${next.shift.title}.`,
          severity: "error",
          shiftId: next.shift.id
        });
        continue;
      }

      const restHours = roundHours((nextStart - currentEnd) / 1000 / 60 / 60);

      if (restHours < minimumRestHours) {
        warnings.push({
          id: `rest-${staffProfileId}-${current.shift.id}-${next.shift.id}`,
          message: `${staffName} has only ${restHours.toFixed(2)} rest hours before ${next.shift.title}.`,
          severity: "warning",
          shiftId: next.shift.id
        });
      }
    }
  });

  return warnings;
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

function parseIsoDateAsUtc(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return parseIsoDateAsUtc(todayInSingapore());
  }

  const [year, month, day] = value.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day));
}

function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateInSingapore(date: Date) {
  const parts = new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "2-digit",
    timeZone: singaporeTimeZone,
    year: "numeric"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    timeZone: singaporeTimeZone
  }).format(new Date(`${value}T00:00:00+08:00`));
}

function formatStaffRoleForSchedule(role: StaffRole) {
  if (role === "lead_coach") {
    return "Lead coach";
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}
