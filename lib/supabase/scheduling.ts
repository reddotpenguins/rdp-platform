import { createClient } from "@/lib/supabase/server";
import {
  detectScheduleConflicts,
  type RosterAssignment,
  type RosterShift,
  type ScheduleConflictWarning,
  type ScheduleResourceOption,
  type ScheduleStaffOption,
  type ScheduleTemplate,
  type ScheduleWeek,
  type ScheduleWeekStatus,
  type ScheduleWorkLocation
} from "@/lib/scheduling";
import type { StaffRole } from "@/lib/staffRoles";

type BaseResourceRow = {
  active: boolean;
  id: string;
  name: string;
  sort_order: number | null;
};

type WorkLocationRow = BaseResourceRow & {
  geofence_radius_meters: number;
  latitude: number | null;
  longitude: number | null;
  short_name: string | null;
};

type StaffProfileRow = {
  active: boolean;
  centre_name: string | null;
  coach_name: string | null;
  email: string;
  full_name: string;
  id: string;
  role: StaffRole;
};

type StaffCentreRow = {
  centre_name: string | null;
  staff_profile_id: string;
};

type StaffQualificationRow = {
  qualification_id: string;
  staff_profile_id: string;
};

type ScheduleWeekRow = {
  id: string;
  notes: string | null;
  published_at: string | null;
  status: ScheduleWeekStatus;
  week_start_date: string;
};

type ScheduleShiftRow = {
  colour: string | null;
  department_id: string | null;
  ends_at: string;
  id: string;
  notes: string | null;
  programme_id: string | null;
  required_manpower: number | null;
  required_qualification_id: string | null;
  required_role: StaffRole | null;
  schedule_week_id: string;
  session_label: string | null;
  starts_at: string;
  status: ScheduleWeekStatus;
  title: string;
  work_location_id: string | null;
};

type ShiftAssignmentRow = {
  id: string;
  shift_id: string;
  staff_profile_id: string;
  status: RosterAssignment["status"];
};

type ScheduleTemplateRow = {
  active: boolean;
  description: string | null;
  id: string;
  name: string;
};

export type SchedulingDashboardData = {
  conflicts: ScheduleConflictWarning[];
  departments: ScheduleResourceOption[];
  error?: string;
  locations: ScheduleWorkLocation[];
  programmes: ScheduleResourceOption[];
  qualifications: ScheduleResourceOption[];
  shifts: RosterShift[];
  staff: ScheduleStaffOption[];
  templates: ScheduleTemplate[];
  week: ScheduleWeek;
};

export async function getSchedulingDashboardData(weekStartDate: string): Promise<SchedulingDashboardData> {
  const supabase = createClient();
  const emptyWeek = getEmptyWeek(weekStartDate);
  const { data: organisation, error: organisationError } = await supabase
    .from("organisations")
    .select("id")
    .eq("slug", "red-dot-penguins")
    .maybeSingle<{ id: string }>();

  if (organisationError || !organisation) {
    return getEmptyData(emptyWeek, "Run the scheduling Phase 1 SQL in Supabase before using this page.");
  }

  const organisationId = organisation.id;
  const [
    staffResult,
    staffCentresResult,
    locationsResult,
    departmentsResult,
    programmesResult,
    qualificationsResult,
    staffQualificationsResult,
    templatesResult,
    weekResult
  ] = await Promise.all([
    supabase
      .from("staff_profiles")
      .select("id, email, full_name, role, coach_name, centre_name, active")
      .eq("organisation_id", organisationId)
      .order("full_name", { ascending: true }),
    supabase
      .from("staff_profile_centres")
      .select("staff_profile_id, centre_name"),
    supabase
      .from("work_locations")
      .select("id, name, short_name, latitude, longitude, geofence_radius_meters, active, sort_order")
      .eq("organisation_id", organisationId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("schedule_departments")
      .select("id, name, active, sort_order")
      .eq("organisation_id", organisationId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("schedule_programmes")
      .select("id, name, active, sort_order")
      .eq("organisation_id", organisationId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("qualifications")
      .select("id, name, active, sort_order")
      .eq("organisation_id", organisationId)
      .order("name", { ascending: true }),
    supabase
      .from("staff_qualifications")
      .select("staff_profile_id, qualification_id")
      .eq("organisation_id", organisationId),
    supabase
      .from("schedule_templates")
      .select("id, name, description, active")
      .eq("organisation_id", organisationId)
      .eq("active", true)
      .order("name", { ascending: true }),
    supabase
      .from("schedule_weeks")
      .select("id, week_start_date, status, notes, published_at")
      .eq("organisation_id", organisationId)
      .eq("week_start_date", weekStartDate)
      .maybeSingle<ScheduleWeekRow>()
  ]);

  const firstError = [
    staffResult.error,
    staffCentresResult.error,
    locationsResult.error,
    departmentsResult.error,
    programmesResult.error,
    qualificationsResult.error,
    staffQualificationsResult.error,
    templatesResult.error,
    weekResult.error
  ].find(Boolean);

  if (firstError) {
    return getEmptyData(emptyWeek, firstError.message);
  }

  const staff = mapStaff(
    (staffResult.data ?? []) as StaffProfileRow[],
    (staffCentresResult.data ?? []) as StaffCentreRow[],
    (staffQualificationsResult.data ?? []) as StaffQualificationRow[]
  );
  const locations = ((locationsResult.data ?? []) as WorkLocationRow[]).map(mapLocation);
  const departments = ((departmentsResult.data ?? []) as BaseResourceRow[]).map(mapResource);
  const programmes = ((programmesResult.data ?? []) as BaseResourceRow[]).map(mapResource);
  const qualifications = ((qualificationsResult.data ?? []) as BaseResourceRow[]).map(mapResource);
  const templates = ((templatesResult.data ?? []) as ScheduleTemplateRow[]).map((template) => ({
    active: template.active,
    description: template.description,
    id: template.id,
    name: template.name
  }));
  const week = weekResult.data ? mapWeek(weekResult.data) : emptyWeek;
  const shifts = week.id
    ? await getWeekShifts({
        departments,
        locations,
        programmes,
        qualifications,
        staff,
        weekId: week.id
      })
    : [];

  return {
    conflicts: detectScheduleConflicts(shifts),
    departments,
    locations,
    programmes,
    qualifications,
    shifts,
    staff,
    templates,
    week
  };
}

function getEmptyData(week: ScheduleWeek, error: string): SchedulingDashboardData {
  return {
    conflicts: [],
    departments: [],
    error,
    locations: [],
    programmes: [],
    qualifications: [],
    shifts: [],
    staff: [],
    templates: [],
    week
  };
}

function getEmptyWeek(weekStartDate: string): ScheduleWeek {
  return {
    id: null,
    notes: null,
    publishedAt: null,
    status: "draft",
    weekStartDate
  };
}

async function getWeekShifts({
  departments,
  locations,
  programmes,
  qualifications,
  staff,
  weekId
}: {
  departments: ScheduleResourceOption[];
  locations: ScheduleWorkLocation[];
  programmes: ScheduleResourceOption[];
  qualifications: ScheduleResourceOption[];
  staff: ScheduleStaffOption[];
  weekId: string;
}) {
  const supabase = createClient();
  const { data: shiftRows, error: shiftError } = await supabase
    .from("schedule_shifts")
    .select(
      "id, schedule_week_id, work_location_id, department_id, programme_id, title, session_label, starts_at, ends_at, required_role, required_qualification_id, required_manpower, colour, status, notes"
    )
    .eq("schedule_week_id", weekId)
    .order("starts_at", { ascending: true });

  if (shiftError || !shiftRows?.length) {
    return [];
  }

  const shiftIds = shiftRows.map((shift) => shift.id);
  const { data: assignmentRows } = await supabase
    .from("schedule_shift_assignments")
    .select("id, shift_id, staff_profile_id, status")
    .in("shift_id", shiftIds)
    .neq("status", "removed");
  const assignmentsByShift = new Map<string, RosterAssignment[]>();
  const staffById = new Map(staff.map((staffOption) => [staffOption.id, staffOption]));

  ((assignmentRows ?? []) as ShiftAssignmentRow[]).forEach((assignment) => {
    const assignedStaff = staffById.get(assignment.staff_profile_id);

    if (!assignedStaff) {
      return;
    }

    const rosterAssignment: RosterAssignment = {
      id: assignment.id,
      qualificationIds: assignedStaff.qualificationIds,
      staffName: getStaffName(assignedStaff),
      staffProfileId: assignedStaff.id,
      staffRole: assignedStaff.role,
      status: assignment.status
    };
    const current = assignmentsByShift.get(assignment.shift_id) ?? [];
    current.push(rosterAssignment);
    assignmentsByShift.set(assignment.shift_id, current);
  });

  const locationById = new Map(locations.map((location) => [location.id, location]));
  const departmentById = new Map(departments.map((department) => [department.id, department]));
  const programmeById = new Map(programmes.map((programme) => [programme.id, programme]));
  const qualificationById = new Map(qualifications.map((qualification) => [qualification.id, qualification]));

  return ((shiftRows ?? []) as ScheduleShiftRow[]).map((shift): RosterShift => ({
    assignments: assignmentsByShift.get(shift.id) ?? [],
    colour: shift.colour ?? "#f26a2e",
    departmentId: shift.department_id,
    departmentName: shift.department_id ? departmentById.get(shift.department_id)?.name ?? null : null,
    endsAt: shift.ends_at,
    id: shift.id,
    locationName: shift.work_location_id ? locationById.get(shift.work_location_id)?.name ?? null : null,
    notes: shift.notes,
    programmeId: shift.programme_id,
    programmeName: shift.programme_id ? programmeById.get(shift.programme_id)?.name ?? null : null,
    requiredManpower: shift.required_manpower ?? 1,
    requiredQualificationId: shift.required_qualification_id,
    requiredQualificationName: shift.required_qualification_id
      ? qualificationById.get(shift.required_qualification_id)?.name ?? null
      : null,
    requiredRole: shift.required_role,
    scheduleWeekId: shift.schedule_week_id,
    sessionLabel: shift.session_label,
    startsAt: shift.starts_at,
    status: shift.status,
    title: shift.title,
    workLocationId: shift.work_location_id
  }));
}

function mapStaff(
  rows: StaffProfileRow[],
  centreRows: StaffCentreRow[],
  qualificationRows: StaffQualificationRow[]
): ScheduleStaffOption[] {
  const centresByStaff = new Map<string, string[]>();
  const qualificationsByStaff = new Map<string, string[]>();

  centreRows.forEach((row) => {
    if (!row.centre_name) {
      return;
    }

    const centres = centresByStaff.get(row.staff_profile_id) ?? [];
    centres.push(row.centre_name);
    centresByStaff.set(row.staff_profile_id, centres);
  });

  qualificationRows.forEach((row) => {
    const qualifications = qualificationsByStaff.get(row.staff_profile_id) ?? [];
    qualifications.push(row.qualification_id);
    qualificationsByStaff.set(row.staff_profile_id, qualifications);
  });

  return rows.map((row) => ({
    active: row.active,
    assignedCentres: centresByStaff.get(row.id) ?? [],
    centreName: row.centre_name,
    coachName: row.coach_name,
    email: row.email,
    fullName: row.full_name,
    id: row.id,
    qualificationIds: qualificationsByStaff.get(row.id) ?? [],
    role: row.role
  }));
}

function mapResource(row: BaseResourceRow): ScheduleResourceOption {
  return {
    active: row.active,
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order ?? 100
  };
}

function mapLocation(row: WorkLocationRow): ScheduleWorkLocation {
  return {
    ...mapResource(row),
    geofenceRadiusMeters: row.geofence_radius_meters,
    latitude: row.latitude,
    longitude: row.longitude,
    shortName: row.short_name
  };
}

function mapWeek(row: ScheduleWeekRow): ScheduleWeek {
  return {
    id: row.id,
    notes: row.notes,
    publishedAt: row.published_at,
    status: row.status,
    weekStartDate: row.week_start_date
  };
}

function getStaffName(staff: ScheduleStaffOption) {
  return staff.fullName || staff.coachName || staff.email;
}
