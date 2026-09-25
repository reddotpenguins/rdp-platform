"use server";
import {qualificationCoversShift,validDate} from "@/lib/workforce-certificates";

import {availabilityIntersects,periodRange,statusPrefix,blockMarker,type AvailabilityRow} from "@/lib/schedule-workforce";
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

  await validateShiftResources(supabase,organisationId,values);
  let retainedAssignments: string[] | null = null;
  if(values.shiftId){
    const existing=await requireEditableShift(supabase,organisationId,values.shiftId);
    if(existing.status==='completed'||existing.status==='cancelled')redirectWithScheduleError(weekStartDate,'Completed or cancelled shifts cannot be edited.');
    const assigned=await getAssignmentsForShiftIds(supabase,[values.shiftId]);
    const ids=(assigned.get(values.shiftId)||[]).map(a=>a.staff_profile_id);
    if(ids.length>1)retainedAssignments=ids;
  }
  for(const staffId of retainedAssignments||[values.staffProfileId]){
    const assignmentError=await validateAssignment({endsAt:values.endsAt,excludeShiftId:values.shiftId,organisationId,requiredQualificationId:values.requiredQualificationId,requiredRole:values.requiredRole,staffProfileId:staffId,startsAt:values.startsAt,supabase});
    if(assignmentError)redirectWithScheduleError(weekStartDate,assignmentError);
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
      .eq("id", shiftId).eq("organisation_id",organisationId);

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

  if(!retainedAssignments)await replaceShiftAssignment({
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
  await requireEditableShift(supabase,organisationId,shiftId);
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
  await requireEditableShift(supabase,organisationId,shiftId);
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

  const {data:publishShifts,error:publishReadError}=await supabase.from('schedule_shifts').select('id,starts_at,ends_at,required_role,required_qualification_id').eq('organisation_id',organisationId).eq('schedule_week_id',week.id).neq('status','cancelled');
  if(publishReadError)redirectWithScheduleError(weekStartDate,publishReadError.message);
  const publishAssignments=await getAssignmentsForShiftIds(supabase,(publishShifts||[]).map(s=>s.id));
  for(const shift of publishShifts||[])for(const assigned of publishAssignments.get(shift.id)||[]){
    const issue=await validateAssignment({endsAt:shift.ends_at,excludeShiftId:shift.id,organisationId,requiredQualificationId:shift.required_qualification_id,requiredRole:shift.required_role,staffProfileId:assigned.staff_profile_id,startsAt:shift.starts_at,supabase});
    if(issue)redirectWithScheduleError(weekStartDate,issue);
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
  if(['completed','cancelled'].includes(targetWeek.status))redirectWithScheduleError(weekStartDate,'The destination week is closed.');
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
  const {data:ownedTemplate,error:templateOwnerError}=await supabase.from("schedule_templates").select("id").eq("id",templateId).eq("organisation_id",organisationId).eq("active",true).maybeSingle();
  if(templateOwnerError||!ownedTemplate)redirectWithScheduleError(weekStartDate,"Choose an active template in this organisation.");
  const week = await getOrCreateScheduleWeek(supabase, organisationId, weekStartDate, profile.id);
  if(['completed','cancelled'].includes(week.status))redirectWithScheduleError(weekStartDate,'The destination week is closed.');
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
    const issue=await validateAssignment({endsAt:range.endsAt,organisationId,requiredQualificationId:templateShift.required_qualification_id,requiredRole:templateShift.required_role,staffProfileId:templateShift.assigned_staff_profile_id||'',startsAt:range.startsAt,supabase});
    if(issue)redirectWithScheduleError(weekStartDate,`Template stopped before ${targetDate}: ${issue} Previously saved rows remain visible; review before retrying.`);
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
      .select("id, starts_at, ends_at, required_qualification_id, required_role, schedule_week_id, status")
      .eq("id", shiftId)
      .eq("organisation_id", organisationId)
      .single();

    if (error || !shift) {
      return { error: error?.message ?? "Shift was not found.", ok: false };
    }

    await requireEditableShift(supabase,organisationId,shiftId);
    if(getWeekStartDate(targetDate)!==normalizedWeekStartDate||getWeekStartDate(getShiftSingaporeDate(shift.starts_at))!==normalizedWeekStartDate)return {ok:false,error:'Move shifts within the displayed week.'};
    const currentAssignments=await getAssignmentsForShiftIds(supabase,[shiftId]);
    if((currentAssignments.get(shiftId)||[]).length>1)return {ok:false,error:'Edit this group shift to preserve all assigned staff.'};
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
      requiredRole: shift.required_role,
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
      .select("id, starts_at, ends_at, required_qualification_id, required_role, schedule_week_id, status")
      .eq("id", shiftId)
      .eq("organisation_id", organisationId)
      .single();

    if (error || !shift) {
      return { error: error?.message ?? "Shift was not found.", ok: false };
    }

    await requireEditableShift(supabase,organisationId,shiftId);
    const startsAtMs = Date.parse(shift.starts_at);
    const nextEndsAtMs = Date.parse(shift.ends_at) + minutes * 60 * 1000;

    if (!Number.isFinite(startsAtMs) || !Number.isFinite(nextEndsAtMs) || nextEndsAtMs - startsAtMs < 15 * 60 * 1000) {
      return { error: "Shifts must be at least 15 minutes long.", ok: false };
    }

    const nextEndsAt = new Date(nextEndsAtMs).toISOString();
    const assignments = await getAssignmentsForShiftIds(supabase, [shiftId]);
    for(const assigned of assignments.get(shiftId)||[]){
      const assignmentError=await validateAssignment({endsAt:nextEndsAt,excludeShiftId:shiftId,organisationId,requiredQualificationId:shift.required_qualification_id,requiredRole:shift.required_role,staffProfileId:assigned.staff_profile_id,startsAt:shift.starts_at,supabase});
      if(assignmentError)return {error:assignmentError,ok:false};
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
  if(requiredRole&&!isStaffRole(requiredRole))throw new Error("Choose a valid required role.");
  const colour=getOptionalText(formData,"colour")||"#2563eb";if(!/^#[0-9a-f]{6}$/i.test(colour))throw new Error("Choose a valid colour.");

  return {
    colour,
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
  if(staffProfileId){
    const {error}=await supabase.from('schedule_shift_assignments').upsert({created_by:userId,organisation_id:organisationId,shift_id:shiftId,staff_profile_id:staffProfileId,status:'assigned'},{onConflict:'shift_id,staff_profile_id'});
    if(error)throw new Error(error.message);
  }
  let removal=supabase.from('schedule_shift_assignments').update({status:'removed',updated_at:new Date().toISOString()}).eq('shift_id',shiftId).eq('organisation_id',organisationId);
  if(staffProfileId)removal=removal.neq('staff_profile_id',staffProfileId);
  const {error}=await removal;if(error)throw new Error(error.message);

}

async function validateAssignment({
  endsAt,
  excludeShiftId,
  organisationId,
  requiredQualificationId,
  requiredRole,
  staffProfileId,
  startsAt,
  supabase
}: {
  endsAt: string;
  excludeShiftId?: string | null;
  organisationId: string;
  requiredQualificationId: string | null;
  requiredRole?: string | null;
  staffProfileId: string;
  startsAt: string;
  supabase: SupabaseClient;
}) {
  if (!staffProfileId) {
    return null;
  }

  const {data:staff,error:staffError}=await supabase.from('staff_profiles').select('id,role,active').eq('organisation_id',organisationId).eq('id',staffProfileId).maybeSingle();
  if(staffError||!staff?.active)return 'Choose an active staff member in this organisation.';
  if(requiredRole&&staff.role!==requiredRole)return 'This staff member does not match the required role.';
  const [overlapError, unavailableError, qualificationError] = await Promise.all([
    getStaffOverlapError(supabase, organisationId, staffProfileId, startsAt, endsAt, excludeShiftId),
    getStaffUnavailableError(supabase, organisationId, staffProfileId, startsAt, endsAt),
    getStaffQualificationError(supabase, organisationId, staffProfileId, requiredQualificationId, startsAt, endsAt)
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
    .in("status", ["assigned","acknowledged"]);

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

  if(data?.length)return 'This staff member is unavailable during that shift.';
  const {data:availability,error:availabilityError}=await supabase.from('staff_availability').select('*').eq('organisation_id',organisationId).eq('staff_profile_id',staffProfileId).eq('availability_status','unavailable');
  if(availabilityError)return availabilityError.message;
  return (availability||[]).some(row=>availabilityIntersects(row as AvailabilityRow,startsAt,endsAt))?'This staff member is marked on leave or unavailable during this shift.':null;
}

async function getStaffQualificationError(
  supabase: SupabaseClient,
  organisationId: string,
  staffProfileId: string,
  requiredQualificationId: string | null,
  startsAt: string,
  endsAt: string
) {
  if (!requiredQualificationId) {
    return null;
  }

  const { data, error } = await supabase
    .from("staff_qualifications")
    .select("id,awarded_at,expires_at")
    .eq("organisation_id", organisationId)
    .eq("staff_profile_id", staffProfileId)
    .eq("qualification_id", requiredQualificationId)
    .limit(1);

  if (error) {
    return error.message;
  }

  if(!data?.length)return "This staff member does not have the required qualification.";
  return qualificationCoversShift(data[0],startsAt,endsAt)?null:"The required qualification is expired or not valid for the whole shift.";
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
    if(['completed','cancelled'].includes(weekStatus))throw new Error('The destination week is closed.');
    for(const assigned of assignments.get(sourceShift.id)||[]){const issue=await validateAssignment({endsAt:range.endsAt,organisationId,requiredQualificationId:sourceShift.required_qualification_id,requiredRole:sourceShift.required_role,staffProfileId:assigned.staff_profile_id,startsAt:range.startsAt,supabase});if(issue)throw new Error(`Copy stopped before ${targetDate}: ${issue}`);}
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

  const { data, error } = await supabase
    .from("schedule_shift_assignments")
    .select("shift_id, staff_profile_id")
    .in("shift_id", shiftIds)
    .in("status", ["assigned","acknowledged"]);

  if(error)throw new Error(error.message);
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
    entityId: string | null;
    entityType: string;
    eventType: string;
    metadata: Record<string, unknown>;
    organisationId: string;
  }
) {
  const {error}=await supabase.from("audit_events").insert({
    actor_staff_id: values.actorStaffId,
    entity_id: values.entityId,
    entity_type: values.entityType,
    event_type: values.eventType,
    metadata: values.metadata,
    organisation_id: values.organisationId
  });
  if(error)throw new Error("Change saved, but the audit entry failed. Refresh before retrying.");
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

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+"T00:00:00Z"))||new Date(value+"T00:00:00Z").toISOString().slice(0,10)!==value) {
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

async function requireEditableShift(supabase:SupabaseClient,organisationId:string,shiftId:string){
 const {data:shift,error}=await supabase.from('schedule_shifts').select('id,status,schedule_week_id').eq('organisation_id',organisationId).eq('id',shiftId).maybeSingle();
 if(error||!shift)throw new Error('Shift was not found in this organisation.');
 const {data:week,error:weekError}=await supabase.from('schedule_weeks').select('status').eq('organisation_id',organisationId).eq('id',shift.schedule_week_id).single();
 if(weekError||!week||['completed','cancelled'].includes(week.status)||['completed','cancelled'].includes(shift.status))throw new Error('Completed or cancelled schedules cannot be changed.');
 return shift;
}
async function validateShiftResources(supabase:SupabaseClient,organisationId:string,values:ReturnType<typeof getShiftFormValues>){
 for(const [table,id] of [['work_locations',values.workLocationId],['schedule_departments',values.departmentId],['schedule_programmes',values.programmeId],['qualifications',values.requiredQualificationId]] as const){
  if(!id)continue;const {data,error}=await supabase.from(table).select('id').eq('id',id).eq('organisation_id',organisationId).maybeSingle();if(error||!data)throw new Error('Choose scheduling resources from this organisation.');
 }
}
export async function saveCentreAction(formData:FormData){
 const {profile}=await requireSchedulingAdmin();const supabase=createClient();const organisationId=await getOrganisationId(supabase);const week=getWeekStartDate(getRequiredDate(formData,'weekStartDate'));
 const id=getOptionalText(formData,'locationId'),name=getRequiredText(formData,'name'),latitude=getOptionalNumber(formData,'latitude'),longitude=getOptionalNumber(formData,'longitude'),radius=getPositiveInteger(formData,'geofenceRadiusMeters');
 if(name.length>100||radius<20||radius>1000||(latitude===null)!==(longitude===null)||(latitude!==null&&Math.abs(latitude)>90)||(longitude!==null&&Math.abs(longitude)>180))redirectWithScheduleError(week,'Use a name, both valid coordinates (or neither), and a radius of 20–1,000 metres.');
 const payload={name,short_name:getOptionalText(formData,'shortName')||null,latitude,longitude,geofence_radius_meters:radius};
 const result=id?await supabase.from('work_locations').update(payload).eq('id',id).eq('organisation_id',organisationId).select('id').single():await supabase.from('work_locations').insert({...payload,organisation_id:organisationId,active:true}).select('id').single();
 if(result.error||!result.data)redirectWithScheduleError(week,result.error?.message||'Centre could not be saved.');
 await writeScheduleAudit(supabase,{actorStaffId:profile.id,entityId:result.data.id,entityType:'work_location',eventType:id?'schedule.location.updated':'schedule.location.created',metadata:{name},organisationId});revalidatePath('/schedule');redirectWithScheduleSuccess(week,'Centre saved. Existing assignments remain connected.');
}
export async function saveBlockPresetAction(formData:FormData){
 const {profile}=await requireSchedulingAdmin();const supabase=createClient();const organisationId=await getOrganisationId(supabase);const values=getShiftFormValues(formData);const week=getWeekStartDate(values.shiftDate);const day=Number(getRequiredText(formData,'dayOffset'));
 if(!Number.isInteger(day)||day<0||day>6)redirectWithScheduleError(week,'Choose a valid weekday.');
 await validateShiftResources(supabase,organisationId,values);
 if(values.staffProfileId){const {data,error}=await supabase.from('staff_profiles').select('id').eq('organisation_id',organisationId).eq('id',values.staffProfileId).eq('active',true).maybeSingle();if(error||!data)redirectWithScheduleError(week,'Choose an active default coach.');}
 const {data:template,error}=await supabase.from('schedule_templates').insert({organisation_id:organisationId,name:values.title,description:blockMarker,active:false,created_by:profile.id}).select('id').single();
 if(error||!template)redirectWithScheduleError(week,error?.message||'Could not save preset.');
 const {error:rowError}=await supabase.from('schedule_template_shifts').insert({template_id:template.id,day_offset:day,title:values.title,start_time:getShiftSingaporeTime(values.startsAt),end_time:getShiftSingaporeTime(values.endsAt),work_location_id:values.workLocationId,assigned_staff_profile_id:values.staffProfileId||null,department_id:values.departmentId,programme_id:values.programmeId,required_role:values.requiredRole,required_qualification_id:values.requiredQualificationId,required_manpower:values.requiredManpower,colour:values.colour,session_label:values.sessionLabel,notes:values.notes});
 if(rowError)redirectWithScheduleError(week,rowError.message);
 const {error:activateError}=await supabase.from('schedule_templates').update({active:true}).eq('id',template.id).eq('organisation_id',organisationId);if(activateError)redirectWithScheduleError(week,activateError.message);
 await writeScheduleAudit(supabase,{actorStaffId:profile.id,entityId:template.id,entityType:'schedule_template',eventType:'schedule.block.created',metadata:{day},organisationId});revalidatePath('/schedule');redirectWithScheduleSuccess(week,'Schedule preset saved for the team.');
}
export async function saveRosterStatusAction(formData:FormData){
 const {profile}=await requireSchedulingAdmin();const supabase=createClient();const organisationId=await getOrganisationId(supabase);const date=getRequiredDate(formData,'date'),week=getWeekStartDate(date),staffId=getRequiredText(formData,'staffProfileId'),period=getRequiredText(formData,'period'),status=getRequiredText(formData,'status');
 if(!['AM','PM'].includes(period)||!['Not On Shift','Sick leave','On Leave','Available for work'].includes(status))redirectWithScheduleError(week,'Choose a valid roster status. On Shift follows the roster.');
 const existingWeek=await getScheduleWeek(supabase,organisationId,week);if(existingWeek&&['completed','cancelled'].includes(existingWeek.status))redirectWithScheduleError(week,'This schedule week is closed.');
 const {data:staff,error:staffError}=await supabase.from('staff_profiles').select('id').eq('id',staffId).eq('organisation_id',organisationId).eq('active',true).maybeSingle();if(staffError||!staff)redirectWithScheduleError(week,'Choose an active staff member.');
 const range=periodRange(date,period as 'AM'|'PM');const overlap=await getStaffOverlapError(supabase,organisationId,staffId,range.startsAt,range.endsAt);if(overlap)redirectWithScheduleError(week,'Reassign the affected shifts before changing this period’s status.');
 const {data:approved,error:approvedError}=await supabase.from('staff_unavailable_periods').select('id').eq('organisation_id',organisationId).eq('staff_profile_id',staffId).eq('status','approved').lt('starts_at',range.endsAt).gt('ends_at',range.startsAt).limit(1);
 if(approvedError||approved?.length)redirectWithScheduleError(week,approvedError?.message||'An approved unavailable period controls this status. Review that record before changing it.');
 const start=period==='AM'?'00:00:00':'12:00:00',end=period==='AM'?'12:00:00':'24:00:00';
 const {data:rows,error:readError}=await supabase.from('staff_availability').select('id,notes').eq('organisation_id',organisationId).eq('staff_profile_id',staffId).eq('effective_from',date).eq('effective_to',date).eq('start_time',start).eq('end_time',end).like('notes',`${statusPrefix}%`);
 if(readError)redirectWithScheduleError(week,readError.message);
 // Reuse only this editor's exact-date markers; recurring and external availability stay intact.
 const ids=(rows||[]).map(r=>r.id);let savedId=ids[0]||null;
 if(status==='Not On Shift'){
  if(ids.length){const {error}=await supabase.from('staff_availability').delete().in('id',ids).eq('organisation_id',organisationId);if(error)redirectWithScheduleError(week,error.message);}
 }else{
  const payload={organisation_id:organisationId,staff_profile_id:staffId,weekday:new Date(`${date}T12:00:00Z`).getUTCDay(),start_time:start,end_time:end,availability_status:status==='Available for work'?'available':'unavailable',effective_from:date,effective_to:date,notes:`${statusPrefix}${status}`};
  const result=savedId?await supabase.from('staff_availability').update(payload).eq('id',savedId).eq('organisation_id',organisationId).select('id').single():await supabase.from('staff_availability').insert(payload).select('id').single();
  if(result.error||!result.data)redirectWithScheduleError(week,result.error?.message||'Status could not be saved.');savedId=result.data.id;
  if(ids.length>1){const {error}=await supabase.from('staff_availability').delete().in('id',ids.slice(1)).eq('organisation_id',organisationId);if(error)redirectWithScheduleError(week,error.message);}
 }
 await writeScheduleAudit(supabase,{actorStaffId:profile.id,entityId:savedId,entityType:'staff_availability',eventType:'schedule.status.updated',metadata:{staffId,date,period,status},organisationId});revalidatePath('/schedule');redirectWithScheduleSuccess(week,'Roster status saved.');
}

export async function saveStaffCertificateAction(formData:FormData){
 const {profile}=await requireSchedulingAdmin();const supabase=createClient();const organisationId=await getOrganisationId(supabase);const week=getWeekStartDate(getRequiredDate(formData,'weekStartDate'));
 const staffId=getRequiredText(formData,'staffProfileId'),qualificationId=getRequiredText(formData,'qualificationId'),awarded=getOptionalText(formData,'awardedAt')||null,expires=getOptionalText(formData,'expiresAt')||null,notes=getRequiredText(formData,'notes');
 if(formData.get('verified')!=='on'||notes.length<3||notes.length>500||(awarded&&!validDate(awarded))||(expires&&!validDate(expires))||(awarded&&expires&&expires<awarded))redirectWithScheduleError(week,'Verify the certificate, check its dates and add a note (3–500 characters).');
 const [person,qualification]=await Promise.all([supabase.from('staff_profiles').select('id').eq('id',staffId).eq('organisation_id',organisationId).eq('active',true).maybeSingle(),supabase.from('qualifications').select('id').eq('id',qualificationId).eq('organisation_id',organisationId).eq('active',true).maybeSingle()]);
 if(person.error||qualification.error||!person.data||!qualification.data)redirectWithScheduleError(week,'Choose active staff and a qualification from this organisation.');
 const {data:existing,error:readError}=await supabase.from('staff_qualifications').select('id,awarded_at,expires_at').eq('organisation_id',organisationId).eq('staff_profile_id',staffId).eq('qualification_id',qualificationId).maybeSingle();
 if(readError)redirectWithScheduleError(week,'Could not read the existing certificate.');
 const payload={organisation_id:organisationId,staff_profile_id:staffId,qualification_id:qualificationId,awarded_at:awarded,expires_at:expires,notes,updated_at:new Date().toISOString()};
 const result=existing?await supabase.from('staff_qualifications').update(payload).eq('id',existing.id).eq('organisation_id',organisationId).select('id').single():await supabase.from('staff_qualifications').insert(payload).select('id').single();
 if(result.error||!result.data)redirectWithScheduleError(week,'Certificate could not be saved. Refresh before retrying.');
 await writeScheduleAudit(supabase,{actorStaffId:profile.id,entityId:result.data.id,entityType:'staff_qualification',eventType:'staff.qualification.verified',metadata:{staffId,qualificationId,previousAwarded:existing?.awarded_at,previousExpiry:existing?.expires_at,awarded,expires},organisationId});
 revalidatePath('/schedule');redirect(`/schedule?week=${week}&view=qualifications&saved=${encodeURIComponent('Verified certificate saved.')}`);
}
export async function saveQualificationTypeAction(formData:FormData){
 const {profile}=await requireSchedulingAdmin();const supabase=createClient();const organisationId=await getOrganisationId(supabase);const week=getWeekStartDate(getRequiredDate(formData,'weekStartDate'));const name=getRequiredText(formData,'name');
 if(name.length>80)redirectWithScheduleError(week,'Qualification name must be 80 characters or fewer.');
 const {data,error}=await supabase.from('qualifications').insert({organisation_id:organisationId,name,active:true}).select('id').single();if(error||!data)redirectWithScheduleError(week,'Qualification could not be saved. It may already exist.');
 await writeScheduleAudit(supabase,{actorStaffId:profile.id,entityId:data.id,entityType:'qualification',eventType:'qualification.created',metadata:{name},organisationId});
 revalidatePath('/schedule');redirect(`/schedule?week=${week}&view=qualifications&saved=${encodeURIComponent('Qualification type added.')}`);
}
