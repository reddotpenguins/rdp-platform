"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addDaysToIsoDate,
  getShiftSingaporeDate,
  getShiftSingaporeTime,
  getWeekStartDate,
  parseSingaporeShiftRange
} from "@/lib/scheduling";
import { canManageScheduling, isStaffRole, type StaffProfile } from "@/lib/staffRoles";
import { createClient } from "@/lib/supabase/server";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

type SupabaseClient = ReturnType<typeof createClient>;

type CopyableShift = {
  colour: string | null;
  department_id: string | null;
  ends_at: string;
  id: string;
  notes: string | null;
  programme_id: string | null;
  required_manpower: number | null;
  required_qualification_id: string | null;
  required_role: string | null;
  session_label: string | null;
  starts_at: string;
  title: string;
  work_location_id: string | null;
};

export type ScheduleActionResult =
  | {
      message: string;
      ok: true;
    }
  | {
      error: string;
      ok: false;
    };

export async function saveShiftAction(formData: FormData) {
  const { profile } = await requireSchedulingAdmin();
  const supabase = createClient();
  const organisationId = await getOrganisationId(supabase);
  const values = getShiftFormValues(formData);
  const weekStartDate = getWeekStartDate(values.shiftDate);
  const week = await getOrCreateScheduleWeek(supabase, organisationId, weekStartDate, profile.id);
  const status = week.status === "published" ? "published" : "draft";

  if (week.status === "completed" || week.status === "cancelled") {
    redirectWithScheduleError(weekStartDate, "Completed or cancelled schedule weeks cannot be edited.");
  }

  const assignmentError = await validateAssignment({
    endsAt: values.endsAt,
    excludeShiftId: values.shiftId,
    organisationId,
    requiredQualificationId: values.requiredQualificationId,
    staffProfileId: values.staffProfileId,
    startsAt: values.startsAt,
    supabase
  });

  if (assignmentError) {
    redirectWithScheduleError(weekStartDate, assignmentError);
  }

  const payload = {
    colour: values.colour,
    department_id: values.departmentId,
    ends_at: values.endsAt,
    notes: values.notes,
    organisation_id: organisationId,
    programme_id: values.programmeId,
    required_manpower: values.requiredManpower,
    required_qualification_id: values.requiredQualificationId,
    required_role: values.requiredRole,
    schedule_week_id: week.id,
    session_label: values.sessionLabel,
    starts_at: values.startsAt,
    status,
    title: values.title,
    updated_at: new Date().toISOString(),
    work_location_id: values.workLocationId
  };

  let shiftId = values.shiftId;

  if (shiftId) {
    const { error } = await supabase
      .from("schedule_shifts")
      .update({
        ...payload,
        version: await getNextShiftVersion(supabase, shiftId)
      })
      .eq("id", shiftId);

    if (error) {
      redirectWithScheduleError(weekStartDate, error.message);
    }
  } else {
    const { data, error } = await supabase
      .from("schedule_shifts")
      .insert({
        ...payload,
        created_by: profile.id
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !data) {
      redirectWithScheduleError(weekStartDate, error?.message ?? "Shift could not be saved.");
    }

    shiftId = data.id;
  }

  await replaceShiftAssignment({
    organisationId,
    shiftId,
    staffProfileId: values.staffProfileId,
    supabase,
    userId: profile.id
  });
  await writeScheduleAudit(supabase, {
    actorStaffId: profile.id,
    entityId: shiftId,
    entityType: "schedule_shift",
    eventType: values.shiftId ? "schedule.shift.updated" : "schedule.shift.created",
    metadata: {
      shiftDate: values.shiftDate,
      weekStartDate
    },
    organisationId
  });

  revalidatePath("/schedule");
  redirectWithScheduleSuccess(weekStartDate, values.shiftId ? "Shift updated." : "Shift added.");
}

export async function cancelShiftAction(formData: FormData) {
  const { profile } = await requireSchedulingAdmin();
  const supabase = createClient();
  const organisationId = await getOrganisationId(supabase);
  const weekStartDate = getWeekStartDate(getRequiredText(formData, "weekStartDate"));
  const shiftId = getRequiredText(formData, "shiftId");
  const { error } = await supabase
    .from("schedule_shifts")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
      version: await getNextShiftVersion(supabase, shiftId)
    })
    .eq("id", shiftId)
    .eq("organisation_id", organisationId);

  if (error) {
    redirectWithScheduleError(weekStartDate, error.message);
  }

  await supabase
    .from("schedule_shift_assignments")
    .update({
      status: "removed",
      updated_at: new Date().toISOString()
    })
    .eq("shift_id", shiftId)
    .eq("organisation_id", organisationId);
  await writeScheduleAudit(supabase, {
    actorStaffId: profile.id,
    entityId: shiftId,
    entityType: "schedule_shift",
    eventType: "schedule.shift.cancelled",
    metadata: { weekStartDate },
    organisationId
  });

  revalidatePath("/schedule");
  redirectWithScheduleSuccess(weekStartDate, "Shift cancelled.");
}

export async function duplicateShiftAction(formData: FormData) {
  const { profile } = await requireSchedulingAdmin();
  const supabase = createClient();
  const organisationId = await getOrganisationId(supabase);
  const weekStartDate = getWeekStartDate(getRequiredText(formData, "weekStartDate"));
  const shiftId = getRequiredText(formData, "shiftId");
  const { data: source, error } = await supabase
    .from("schedule_shifts")
    .select(
      "schedule_week_id, work_location_id, department_id, programme_id, title, session_label, starts_at, ends_at, required_role, required_qualification_id, required_manpower, colour, status, notes"
    )
    .eq("id", shiftId)
    .eq("organisation_id", organisationId)
    .single();

  if (error || !source) {
    redirectWithScheduleError(weekStartDate, error?.message ?? "Shift could not be duplicated.");
  }

  const { data: duplicated, error: insertError } = await supabase
    .from("schedule_shifts")
    .insert({
      ...source,
      organisation_id: organisationId,
      status: source.status === "published" ? "published" : "draft",
      title: `${source.title} copy`,
      created_by: profile.id
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError || !duplicated) {
    redirectWithScheduleError(weekStartDate, insertError?.message ?? "Shift could not be duplicated.");
  }

  await writeScheduleAudit(supabase, {
    actorStaffId: profile.id,
    entityId: duplicated.id,
    entityType: "schedule_shift",
    eventType: "schedule.shift.duplicated",
    metadata: { sourceShiftId: shiftId, weekStartDate },
    organisationId
  });

  revalidatePath("/schedule");
  redirectWithScheduleSuccess(weekStartDate, "Shift duplicated as an open shift.");
}

export async function publishScheduleWeekAction(formData: FormData) {
  const { profile } = await requireSchedulingAdmin();
  const supabase = createClient();
  const organisationId = await getOrganisationId(supabase);
  const weekStartDate = getWeekStartDate(getRequiredText(formData, "weekStartDate"));
  const week = await getOrCreateScheduleWeek(supabase, organisationId, weekStartDate, profile.id);

  if (week.status === "completed" || week.status === "cancelled") {
    redirectWithScheduleError(weekStartDate, "Completed or cancelled schedule weeks cannot be published.");
  }

  const { error } = await supabase
    .from("schedule_weeks")
    .update({
      published_at: new Date().toISOString(),
      published_by: profile.id,
      status: "published",
      updated_at: new Date().toISOString(),
      version: week.version + 1
    })
    .eq("id", week.id);

  if (error) {
    redirectWithScheduleError(weekStartDate, error.message);
  }

  await supabase
    .from("schedule_shifts")
    .update({ status: "published", updated_at: new Date().toISOString() })
    .eq("schedule_week_id", week.id)
    .neq("status", "cancelled");
  await writeScheduleAudit(supabase, {
    actorStaffId: profile.id,
    entityId: week.id,
    entityType: "schedule_week",
    eventType: "schedule.week.published",
    metadata: { weekStartDate },
    organisationId
  });

  revalidatePath("/schedule");
  redirectWithScheduleSuccess(weekStartDate, "Schedule week published company-wide.");
}

export async function copyDayAction(formData: FormData) {
  const { profile } = await requireSchedulingAdmin();
  const supabase = createClient();
  const organisationId = await getOrganisationId(supabase);
  const weekStartDate = getWeekStartDate(getRequiredText(formData, "weekStartDate"));
  const sourceDate = getRequiredDate(formData, "sourceDate");
  const targetDate = getRequiredDate(formData, "targetDate");
  const week = await getOrCreateScheduleWeek(supabase, organisationId, weekStartDate, profile.id);

  if (getWeekStartDate(targetDate) !== weekStartDate) {
    redirectWithScheduleError(weekStartDate, "Choose a target date within the same week.");
  }

  const { data: sourceShifts, error } = await supabase
    .from("schedule_shifts")
    .select(
      "id, work_location_id, department_id, programme_id, title, session_label, starts_at, ends_at, required_role, required_qualification_id, required_manpower, colour, status, notes"
    )
    .eq("schedule_week_id", week.id)
    .neq("status", "cancelled");

  if (error) {
    redirectWithScheduleError(weekStartDate, error.message);
  }

  const sourceDayShifts = (sourceShifts ?? []).filter((shift) => getShiftSingaporeDate(shift.starts_at) === sourceDate);

  if (sourceDayShifts.length === 0) {
    redirectWithScheduleError(weekStartDate, "No source day shifts to copy.");
  }

  await duplicateShiftsToDate({
    organisationId,
    profile,
    shifts: sourceDayShifts,
    supabase,
    targetDate,
    targetWeekId: week.id,
    weekStatus: week.status
  });
  await writeScheduleAudit(supabase, {
    actorStaffId: profile.id,
    entityId: week.id,
    entityType: "schedule_week",
    eventType: "schedule.day.copied",
    metadata: { sourceDate, targetDate, weekStartDate },
    organisationId
  });

  revalidatePath("/schedule");
  redirectWithScheduleSuccess(weekStartDate, "Day copied.");
}

export async function copyWeekToNextWeekAction(formData: FormData) {
  const { profile } = await requireSchedulingAdmin();
  const supabase = createClient();
  const organisationId = await getOrganisationId(supabase);
  const weekStartDate = getWeekStartDate(getRequiredText(formData, "weekStartDate"));
  const targetWeekStartDate = addDaysToIsoDate(weekStartDate, 7);
  const sourceWeek = await getScheduleWeek(supabase, organisationId, weekStartDate);

  if (!sourceWeek) {
    redirectWithScheduleError(weekStartDate, "Create shifts before copying this week.");
  }

  const targetWeek = await getOrCreateScheduleWeek(supabase, organisationId, targetWeekStartDate, profile.id);
  const { count: existingTargetCount } = await supabase
    .from("schedule_shifts")
    .select("id", { count: "exact", head: true })
    .eq("schedule_week_id", targetWeek.id)
    .neq("status", "cancelled");

  if ((existingTargetCount ?? 0) > 0) {
    redirectWithScheduleError(weekStartDate, "The next week already has shifts. Clear it before copying.");
  }

  const { data: sourceShifts, error } = await supabase
    .from("schedule_shifts")
    .select(
      "id, work_location_id, department_id, programme_id, title, session_label, starts_at, ends_at, required_role, required_qualification_id, required_manpower, colour, status, notes"
    )
    .eq("schedule_week_id", sourceWeek.id)
    .neq("status", "cancelled");

  if (error || !sourceShifts?.length) {
    redirectWithScheduleError(weekStartDate, error?.message ?? "No source shifts to copy.");
  }

  for (const sourceShift of sourceShifts) {
    await duplicateShiftsToDate({
      organisationId,
      profile,
      shifts: [sourceShift],
      supabase,
      targetDate: addDaysToIsoDate(getShiftSingaporeDate(sourceShift.starts_at), 7),
      targetWeekId: targetWeek.id,
      weekStatus: targetWeek.status
    });
  }

  await writeScheduleAudit(supabase, {
    actorStaffId: profile.id,
    entityId: targetWeek.id,
    entityType: "schedule_week",
    eventType: "schedule.week.copied",
    metadata: { sourceWeekStartDate: weekStartDate, targetWeekStartDate },
    organisationId
  });

  revalidatePath("/schedule");
  redirectWithScheduleSuccess(targetWeekStartDate, "Week copied to next week.");
}

export async function saveWeekAsTemplateAction(formData: FormData) {
  const { profile } = await requireSchedulingAdmin();
  const supabase = createClient();
  const organisationId = await getOrganisationId(supabase);
  const weekStartDate = getWeekStartDate(getRequiredText(formData, "weekStartDate"));
  const templateName = getRequiredText(formData, "templateName");
  const sourceWeek = await getScheduleWeek(supabase, organisationId, weekStartDate);

  if (!sourceWeek) {
    redirectWithScheduleError(weekStartDate, "Create shifts before saving a template.");
  }

  const { data: shifts, error } = await supabase
    .from("schedule_shifts")
    .select(
      "id, work_location_id, department_id, programme_id, title, session_label, starts_at, ends_at, required_role, required_qualification_id, required_manpower, colour, notes"
    )
    .eq("schedule_week_id", sourceWeek.id)
    .neq("status", "cancelled");

  if (error || !shifts?.length) {
    redirectWithScheduleError(weekStartDate, error?.message ?? "No shifts to save as a template.");
  }

  const { data: template, error: templateError } = await supabase
    .from("schedule_templates")
    .insert({
      created_by: profile.id,
      name: templateName,
      organisation_id: organisationId
    })
    .select("id")
    .single<{ id: string }>();

  if (templateError || !template) {
    redirectWithScheduleError(weekStartDate, templateError?.message ?? "Template could not be saved.");
  }

  const assignments = await getAssignmentsForShiftIds(supabase, shifts.map((shift) => shift.id));
  const templateRows = shifts.map((shift) => {
    const shiftDate = getShiftSingaporeDate(shift.starts_at);
    const dayOffset = getDayOffset(weekStartDate, shiftDate);
    const assignedStaffProfileId = assignments.get(shift.id)?.[0]?.staff_profile_id ?? null;

    return {
      assigned_staff_profile_id: assignedStaffProfileId,
      colour: shift.colour ?? "#f26a2e",
      day_offset: dayOffset,
      department_id: shift.department_id,
      end_time: getShiftSingaporeTime(shift.ends_at),
      notes: shift.notes,
      programme_id: shift.programme_id,
      required_manpower: shift.required_manpower ?? 1,
      required_qualification_id: shift.required_qualification_id,
      required_role: shift.required_role,
      session_label: shift.session_label,
      start_time: getShiftSingaporeTime(shift.starts_at),
      template_id: template.id,
      title: shift.title,
      work_location_id: shift.work_location_id
    };
  });

  const { error: templateShiftError } = await supabase.from("schedule_template_shifts").insert(templateRows);

  if (templateShiftError) {
    redirectWithScheduleError(weekStartDate, templateShiftError.message);
  }

  await writeScheduleAudit(supabase, {
    actorStaffId: profile.id,
    entityId: template.id,
    entityType: "schedule_template",
    eventType: "schedule.template.created",
    metadata: { shiftCount: templateRows.length, weekStartDate },
    organisationId
  });

  revalidatePath("/schedule");
  redirectWithScheduleSuccess(weekStartDate, "Template saved.");
}

export async function applyTemplateAction(formData: FormData) {
  const { profile } = await requireSchedulingAdmin();
  const supabase = createClient();
  const organisationId = await getOrganisationId(supabase);
  const weekStartDate = getWeekStartDate(getRequiredText(formData, "weekStartDate"));
  const templateId = getRequiredText(formData, "templateId");
  const week = await getOrCreateScheduleWeek(supabase, organisationId, weekStartDate, profile.id);
  const { data: templateShifts, error } = await supabase
    .from("schedule_template_shifts")
    .select(
      "day_offset, work_location_id, department_id, programme_id, assigned_staff_profile_id, title, session_label, start_time, end_time, required_role, required_qualification_id, required_manpower, colour, notes"
    )
    .eq("template_id", templateId)
    .order("day_offset", { ascending: true });

  if (error || !templateShifts?.length) {
    redirectWithScheduleError(weekStartDate, error?.message ?? "Template has no shifts.");
  }

  for (const templateShift of templateShifts) {
    const targetDate = addDaysToIsoDate(weekStartDate, Number(templateShift.day_offset ?? 0));
    const range = parseSingaporeShiftRange(targetDate, templateShift.start_time, templateShift.end_time);
    const { data: insertedShift, error: insertError } = await supabase
      .from("schedule_shifts")
      .insert({
        colour: templateShift.colour ?? "#f26a2e",
        created_by: profile.id,
        department_id: templateShift.department_id,
        ends_at: range.endsAt,
        notes: templateShift.notes,
        organisation_id: organisationId,
        programme_id: templateShift.programme_id,
        required_manpower: templateShift.required_manpower ?? 1,
        required_qualification_id: templateShift.required_qualification_id,
        required_role: templateShift.required_role,
        schedule_week_id: week.id,
        session_label: templateShift.session_label,
        starts_at: range.startsAt,
        status: week.status === "published" ? "published" : "draft",
        title: templateShift.title,
        work_location_id: templateShift.work_location_id
      })
      .select("id")
      .single<{ id: string }>();

    if (insertError || !insertedShift) {
      redirectWithScheduleError(weekStartDate, insertError?.message ?? "Template could not be applied.");
    }

    if (templateShift.assigned_staff_profile_id) {
      await replaceShiftAssignment({
        organisationId,
        shiftId: insertedShift.id,
        staffProfileId: templateShift.assigned_staff_profile_id,
        supabase,
        userId: profile.id
      });
    }
  }

  await writeScheduleAudit(supabase, {
    actorStaffId: profile.id,
    entityId: week.id,
    entityType: "schedule_week",
    eventType: "schedule.template.applied",
    metadata: { templateId, weekStartDate },
    organisationId
  });

  revalidatePath("/schedule");
  redirectWithScheduleSuccess(weekStartDate, "Template applied.");
}

export async function updateWorkLocationAction(formData: FormData) {
  const { profile } = await requireSchedulingAdmin();
  const supabase = createClient();
  const organisationId = await getOrganisationId(supabase);
  const weekStartDate = getWeekStartDate(getRequiredText(formData, "weekStartDate"));
  const locationId = getRequiredText(formData, "locationId");
  const radius = getPositiveInteger(formData, "geofenceRadiusMeters");
  const latitude = getOptionalNumber(formData, "latitude");
  const longitude = getOptionalNumber(formData, "longitude");
  const { error } = await supabase
    .from("work_locations")
    .update({
      geofence_radius_meters: radius,
      latitude,
      longitude,
      updated_at: new Date().toISOString()
    })
    .eq("id", locationId)
    .eq("organisation_id", organisationId);

  if (error) {
    redirectWithScheduleError(weekStartDate, error.message);
  }

  await writeScheduleAudit(supabase, {
    actorStaffId: profile.id,
    entityId: locationId,
    entityType: "work_location",
    eventType: "schedule.location.updated",
    metadata: { radius },
    organisationId
  });

  revalidatePath("/schedule");
  redirectWithScheduleSuccess(weekStartDate, "Location settings updated.");
}

export async function moveShiftAction({
  shiftId,
  targetDate,
  targetStaffProfileId,
  weekStartDate
}: {
  shiftId: string;
  targetDate: string;
  targetStaffProfileId: string;
  weekStartDate: string;
}): Promise<ScheduleActionResult> {
  const { profile } = await requireSchedulingAdmin();
  const supabase = createClient();
  const organisationId = await getOrganisationId(supabase);
  const normalizedWeekStartDate = getWeekStartDate(weekStartDate);

  try {
    const { data: shift, error } = await supabase
      .from("schedule_shifts")
      .select("id, starts_at, ends_at, required_qualification_id")
      .eq("id", shiftId)
      .eq("organisation_id", organisationId)
      .single();

    if (error || !shift) {
      return { error: error?.message ?? "Shift was not found.", ok: false };
    }

    const range = parseSingaporeShiftRange(
      targetDate,
      getShiftSingaporeTime(shift.starts_at),
      getShiftSingaporeTime(shift.ends_at)
    );
    const assignmentError = await validateAssignment({
      endsAt: range.endsAt,
      excludeShiftId: shiftId,
      organisationId,
      requiredQualificationId: shift.required_qualification_id,
      staffProfileId: targetStaffProfileId,
      startsAt: range.startsAt,
      supabase
    });

    if (assignmentError) {
      return { error: assignmentError, ok: false };
    }

    const { error: updateError } = await supabase
      .from("schedule_shifts")
      .update({
        ends_at: range.endsAt,
        starts_at: range.startsAt,
        updated_at: new Date().toISOString(),
        version: await getNextShiftVersion(supabase, shiftId)
      })
      .eq("id", shiftId)
      .eq("organisation_id", organisationId);

    if (updateError) {
      return { error: updateError.message, ok: false };
    }

    await replaceShiftAssignment({
      organisationId,
      shiftId,
      staffProfileId: targetStaffProfileId,
      supabase,
      userId: profile.id
    });
    await writeScheduleAudit(supabase, {
      actorStaffId: profile.id,
      entityId: shiftId,
      entityType: "schedule_shift",
      eventType: "schedule.shift.moved",
      metadata: { targetDate, targetStaffProfileId, weekStartDate: normalizedWeekStartDate },
      organisationId
    });

    revalidatePath("/schedule");
    return { message: "Shift moved.", ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Shift could not be moved.", ok: false };
  }
}

export async function resizeShiftAction({
  minutes,
  shiftId,
  weekStartDate
}: {
  minutes: number;
  shiftId: string;
  weekStartDate: string;
}): Promise<ScheduleActionResult> {
  const { profile } = await requireSchedulingAdmin();
  const supabase = createClient();
  const organisationId = await getOrganisationId(supabase);

  try {
    const { data: shift, error } = await supabase
      .from("schedule_shifts")
      .select("id, starts_at, ends_at, required_qualification_id")
      .eq("id", shiftId)
      .eq("organisation_id", organisationId)
      .single();

    if (error || !shift) {
      return { error: error?.message ?? "Shift was not found.", ok: false };
    }

    const startsAtMs = Date.parse(shift.starts_at);
    const nextEndsAtMs = Date.parse(shift.ends_at) + minutes * 60 * 1000;

    if (!Number.isFinite(startsAtMs) || !Number.isFinite(nextEndsAtMs) || nextEndsAtMs - startsAtMs < 15 * 60 * 1000) {
      return { error: "Shifts must be at least 15 minutes long.", ok: false };
    }

    const nextEndsAt = new Date(nextEndsAtMs).toISOString();
    const assignments = await getAssignmentsForShiftIds(supabase, [shiftId]);
    const assignedStaffId = assignments.get(shiftId)?.[0]?.staff_profile_id ?? "";
    const assignmentError = await validateAssignment({
      endsAt: nextEndsAt,
      excludeShiftId: shiftId,
      organisationId,
      requiredQualificationId: shift.required_qualification_id,
      staffProfileId: assignedStaffId,
      startsAt: shift.starts_at,
      supabase
    });

    if (assignmentError) {
      return { error: assignmentError, ok: false };
    }

    const { error: updateError } = await supabase
      .from("schedule_shifts")
      .update({
        ends_at: nextEndsAt,
        updated_at: new Date().toISOString(),
        version: await getNextShiftVersion(supabase, shiftId)
      })
      .eq("id", shiftId)
      .eq("organisation_id", organisationId);

    if (updateError) {
      return { error: updateError.message, ok: false };
    }

    await writeScheduleAudit(supabase, {
      actorStaffId: profile.id,
      entityId: shiftId,
      entityType: "schedule_shift",
      eventType: "schedule.shift.resized",
      metadata: { minutes, weekStartDate },
      organisationId
    });

    revalidatePath("/schedule");
    return { message: "Shift duration updated.", ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Shift could not be resized.", ok: false };
  }
}

async function requireSchedulingAdmin() {
  const session = await requireActiveStaffSession();

  if (!canManageScheduling(session.profile)) {
    redirect("/dashboard");
  }

  return session;
}

async function getOrganisationId(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("organisations")
    .select("id")
    .eq("slug", "red-dot-penguins")
    .single<{ id: string }>();

  if (error || !data) {
    throw new Error("Red Dot Penguins organisation is missing. Run the scheduling Phase 1 SQL first.");
  }

  return data.id;
}

async function getScheduleWeek(supabase: SupabaseClient, organisationId: string, weekStartDate: string) {
  const { data, error } = await supabase
    .from("schedule_weeks")
    .select("id, status, version")
    .eq("organisation_id", organisationId)
    .eq("week_start_date", weekStartDate)
    .maybeSingle<{ id: string; status: string; version: number }>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function getOrCreateScheduleWeek(
  supabase: SupabaseClient,
  organisationId: string,
  weekStartDate: string,
  userId: string
) {
  const existing = await getScheduleWeek(supabase, organisationId, weekStartDate);

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from("schedule_weeks")
    .insert({
      created_by: userId,
      organisation_id: organisationId,
      week_start_date: weekStartDate
    })
    .select("id, status, version")
    .single<{ id: string; status: string; version: number }>();

  if (error || !data) {
    throw new Error(error?.message ?? "Schedule week could not be created.");
  }

  return data;
}

function getShiftFormValues(formData: FormData) {
  const shiftDate = getRequiredDate(formData, "shiftDate");
  const startTime = getRequiredText(formData, "startTime");
  const endTime = getRequiredText(formData, "endTime");
  const range = parseSingaporeShiftRange(shiftDate, startTime, endTime);
  const requiredRole = getOptionalText(formData, "requiredRole");

  return {
    colour: getOptionalText(formData, "colour") || "#f26a2e",
    departmentId: getOptionalText(formData, "departmentId") || null,
    endsAt: range.endsAt,
    notes: getOptionalText(formData, "notes") || null,
    programmeId: getOptionalText(formData, "programmeId") || null,
    requiredManpower: getPositiveInteger(formData, "requiredManpower"),
    requiredQualificationId: getOptionalText(formData, "requiredQualificationId") || null,
    requiredRole: requiredRole && isStaffRole(requiredRole) ? requiredRole : null,
    sessionLabel: getOptionalText(formData, "sessionLabel") || null,
    shiftDate,
    shiftId: getOptionalText(formData, "shiftId") || null,
    staffProfileId: getOptionalText(formData, "staffProfileId") || "",
    startsAt: range.startsAt,
    title: getRequiredText(formData, "title"),
    workLocationId: getOptionalText(formData, "workLocationId") || null
  };
}

async function replaceShiftAssignment({
  organisationId,
  shiftId,
  staffProfileId,
  supabase,
  userId
}: {
  organisationId: string;
  shiftId: string;
  staffProfileId: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  await supabase.from("schedule_shift_assignments").delete().eq("shift_id", shiftId);

  if (!staffProfileId) {
    return;
  }

  const { error } = await supabase.from("schedule_shift_assignments").insert({
    created_by: userId,
    organisation_id: organisationId,
    shift_id: shiftId,
    staff_profile_id: staffProfileId
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function validateAssignment({
  endsAt,
  excludeShiftId,
  organisationId,
  requiredQualificationId,
  staffProfileId,
  startsAt,
  supabase
}: {
  endsAt: string;
  excludeShiftId?: string | null;
  organisationId: string;
  requiredQualificationId: string | null;
  staffProfileId: string;
  startsAt: string;
  supabase: SupabaseClient;
}) {
  if (!staffProfileId) {
    return null;
  }

  const [overlapError, unavailableError, qualificationError] = await Promise.all([
    getStaffOverlapError(supabase, organisationId, staffProfileId, startsAt, endsAt, excludeShiftId),
    getStaffUnavailableError(supabase, organisationId, staffProfileId, startsAt, endsAt),
    getStaffQualificationError(supabase, organisationId, staffProfileId, requiredQualificationId)
  ]);

  return overlapError ?? unavailableError ?? qualificationError;
}

async function getStaffOverlapError(
  supabase: SupabaseClient,
  organisationId: string,
  staffProfileId: string,
  startsAt: string,
  endsAt: string,
  excludeShiftId?: string | null
) {
  const { data: assignments, error } = await supabase
    .from("schedule_shift_assignments")
    .select("shift_id")
    .eq("organisation_id", organisationId)
    .eq("staff_profile_id", staffProfileId)
    .neq("status", "removed");

  if (error || !assignments?.length) {
    return error?.message ?? null;
  }

  const shiftIds = assignments
    .map((assignment) => String(assignment.shift_id))
    .filter((shiftId) => shiftId !== excludeShiftId);

  if (shiftIds.length === 0) {
    return null;
  }

  const { data: shifts, error: shiftsError } = await supabase
    .from("schedule_shifts")
    .select("id, starts_at, ends_at, title")
    .in("id", shiftIds)
    .neq("status", "cancelled");

  if (shiftsError) {
    return shiftsError.message;
  }

  const nextStart = Date.parse(startsAt);
  const nextEnd = Date.parse(endsAt);
  const overlappingShift = (shifts ?? []).find((shift) => {
    const existingStart = Date.parse(shift.starts_at);
    const existingEnd = Date.parse(shift.ends_at);

    return existingStart < nextEnd && existingEnd > nextStart;
  });

  return overlappingShift ? `This staff member already has an overlapping shift: ${overlappingShift.title}.` : null;
}

async function getStaffUnavailableError(
  supabase: SupabaseClient,
  organisationId: string,
  staffProfileId: string,
  startsAt: string,
  endsAt: string
) {
  const { data, error } = await supabase
    .from("staff_unavailable_periods")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("staff_profile_id", staffProfileId)
    .eq("status", "approved")
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt)
    .limit(1);

  if (error) {
    return error.message;
  }

  return data?.length ? "This staff member is unavailable during that shift." : null;
}

async function getStaffQualificationError(
  supabase: SupabaseClient,
  organisationId: string,
  staffProfileId: string,
  requiredQualificationId: string | null
) {
  if (!requiredQualificationId) {
    return null;
  }

  const { data, error } = await supabase
    .from("staff_qualifications")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("staff_profile_id", staffProfileId)
    .eq("qualification_id", requiredQualificationId)
    .limit(1);

  if (error) {
    return error.message;
  }

  return data?.length ? null : "This staff member does not have the required qualification.";
}

async function duplicateShiftsToDate({
  organisationId,
  profile,
  shifts,
  supabase,
  targetDate,
  targetWeekId,
  weekStatus
}: {
  organisationId: string;
  profile: StaffProfile;
  shifts: CopyableShift[];
  supabase: SupabaseClient;
  targetDate: string;
  targetWeekId: string;
  weekStatus: string;
}) {
  const assignments = await getAssignmentsForShiftIds(supabase, shifts.map((shift) => shift.id));

  for (const sourceShift of shifts) {
    const range = parseSingaporeShiftRange(
      targetDate,
      getShiftSingaporeTime(sourceShift.starts_at),
      getShiftSingaporeTime(sourceShift.ends_at)
    );
    const { data: insertedShift, error } = await supabase
      .from("schedule_shifts")
      .insert({
        colour: sourceShift.colour ?? "#f26a2e",
        created_by: profile.id,
        department_id: sourceShift.department_id,
        ends_at: range.endsAt,
        notes: sourceShift.notes,
        organisation_id: organisationId,
        programme_id: sourceShift.programme_id,
        required_manpower: sourceShift.required_manpower ?? 1,
        required_qualification_id: sourceShift.required_qualification_id,
        required_role: sourceShift.required_role,
        schedule_week_id: targetWeekId,
        session_label: sourceShift.session_label,
        starts_at: range.startsAt,
        status: weekStatus === "published" ? "published" : "draft",
        title: sourceShift.title,
        work_location_id: sourceShift.work_location_id
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !insertedShift) {
      throw new Error(error?.message ?? "Shift could not be copied.");
    }

    const sourceAssignments = assignments.get(sourceShift.id) ?? [];

    if (sourceAssignments.length > 0) {
      const { error: assignmentError } = await supabase.from("schedule_shift_assignments").insert(
        sourceAssignments.map((assignment) => ({
          created_by: profile.id,
          organisation_id: organisationId,
          shift_id: insertedShift.id,
          staff_profile_id: assignment.staff_profile_id
        }))
      );

      if (assignmentError) {
        throw new Error(assignmentError.message);
      }
    }
  }
}

async function getAssignmentsForShiftIds(supabase: SupabaseClient, shiftIds: string[]) {
  const assignments = new Map<string, Array<{ staff_profile_id: string }>>();

  if (shiftIds.length === 0) {
    return assignments;
  }

  const { data } = await supabase
    .from("schedule_shift_assignments")
    .select("shift_id, staff_profile_id")
    .in("shift_id", shiftIds)
    .neq("status", "removed");

  (data ?? []).forEach((assignment) => {
    const shiftAssignments = assignments.get(assignment.shift_id) ?? [];
    shiftAssignments.push({ staff_profile_id: assignment.staff_profile_id });
    assignments.set(assignment.shift_id, shiftAssignments);
  });

  return assignments;
}

async function getNextShiftVersion(supabase: SupabaseClient, shiftId: string) {
  const { data } = await supabase
    .from("schedule_shifts")
    .select("version")
    .eq("id", shiftId)
    .maybeSingle<{ version: number }>();

  return (data?.version ?? 1) + 1;
}

async function writeScheduleAudit(
  supabase: SupabaseClient,
  values: {
    actorStaffId: string;
    entityId: string;
    entityType: string;
    eventType: string;
    metadata: Record<string, unknown>;
    organisationId: string;
  }
) {
  await supabase.from("audit_events").insert({
    actor_staff_id: values.actorStaffId,
    entity_id: values.entityId,
    entity_type: values.entityType,
    event_type: values.eventType,
    metadata: values.metadata,
    organisation_id: values.organisationId
  });
}

function getDayOffset(weekStartDate: string, targetDate: string) {
  const start = Date.parse(`${weekStartDate}T00:00:00+08:00`);
  const target = Date.parse(`${targetDate}T00:00:00+08:00`);

  return Math.round((target - start) / 1000 / 60 / 60 / 24);
}

function getRequiredText(formData: FormData, key: string) {
  const value = getOptionalText(formData, key);

  if (!value) {
    throw new Error("Please fill in all required fields.");
  }

  return value;
}

function getOptionalText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getRequiredDate(formData: FormData, key: string) {
  const value = getRequiredText(formData, key);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Use the date picker or YYYY-MM-DD date format.");
  }

  return value;
}

function getPositiveInteger(formData: FormData, key: string) {
  const value = Number(getRequiredText(formData, key));

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Enter a positive whole number.");
  }

  return value;
}

function getOptionalNumber(formData: FormData, key: string) {
  const rawValue = getOptionalText(formData, key);

  if (!rawValue) {
    return null;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value)) {
    throw new Error("Use a valid number.");
  }

  return value;
}

function redirectWithScheduleError(weekStartDate: string, message: string): never {
  const params = new URLSearchParams({ error: message, week: weekStartDate });
  redirect(`/schedule?${params.toString()}`);
}

function redirectWithScheduleSuccess(weekStartDate: string, message: string): never {
  const params = new URLSearchParams({ saved: message, week: weekStartDate });
  redirect(`/schedule?${params.toString()}`);
}
