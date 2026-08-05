"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageStudentLifecycle } from "@/lib/staffRoles";
import type { StaffProfile } from "@/lib/staffRoles";
import { createClient } from "@/lib/supabase/server";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";
import { isStudentLifecycleStatus } from "@/types/studentLifecycle";

export async function createStudentLifecycleAction(formData: FormData) {
  const { profile } = await requireLifecycleAccess();
  const values = getStudentLifecycleValues(formData, profile);
  const supabase = createClient();
  const { error } = await supabase.from("student_profiles").insert({
    ...values,
    created_by: profile.id,
    updated_by: profile.id
  });

  if (error) {
    redirectWithError(error.message);
  }

  revalidateLifecyclePages();
  redirectWithSuccess("Student status record added.");
}

export async function updateStudentLifecycleAction(formData: FormData) {
  const { profile } = await requireLifecycleAccess();
  const studentId = getRequiredText(formData, "studentId");
  const values = getStudentLifecycleValues(formData, profile);
  const supabase = createClient();
  const { error } = await supabase
    .from("student_profiles")
    .update({
      ...values,
      updated_by: profile.id,
      updated_at: new Date().toISOString()
    })
    .eq("id", studentId);

  if (error) {
    redirectWithError(error.message);
  }

  revalidateLifecyclePages();
  redirectWithSuccess("Student status record updated.");
}

async function requireLifecycleAccess() {
  const { profile } = await requireActiveStaffSession();

  if (!canManageStudentLifecycle(profile)) {
    redirect("/dashboard");
  }

  return { profile };
}

function getStudentLifecycleValues(formData: FormData, profile: StaffProfile) {
  const status = getRequiredText(formData, "status");
  const centreName = getOptionalText(formData, "centreName");

  if (!isStudentLifecycleStatus(status)) {
    redirectWithError("Choose a valid student status.");
  }

  assertCanUseCentre(profile, centreName);

  return {
    centre_name: centreName || null,
    coach_name: getOptionalText(formData, "coachName") || null,
    email: getOptionalText(formData, "email") || null,
    notes: getOptionalText(formData, "notes") || null,
    parent_name: getOptionalText(formData, "parentName") || null,
    phone: getOptionalText(formData, "phone") || null,
    programme: getOptionalText(formData, "programme") || null,
    reason: getOptionalText(formData, "reason") || null,
    start_date: getOptionalDate(formData, "startDate"),
    status,
    status_effective_date: getOptionalDate(formData, "statusEffectiveDate") ?? todayInSingapore(),
    student_name: getRequiredText(formData, "studentName")
  };
}

function assertCanUseCentre(profile: StaffProfile, centreName: string) {
  if (profile.role !== "lead_coach") {
    return;
  }

  const allowed = profile.assignedCentres.some(
    (centre) => centre.trim().toLowerCase() === centreName.trim().toLowerCase()
  );

  if (!centreName || !allowed) {
    redirectWithError("Choose one of your assigned centres for this student.");
  }
}

function getRequiredText(formData: FormData, key: string) {
  const value = getOptionalText(formData, key);

  if (!value) {
    redirectWithError("Please fill in all required fields.");
  }

  return value;
}

function getOptionalText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getOptionalDate(formData: FormData, key: string) {
  const value = getOptionalText(formData, key);

  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    redirectWithError("Use the date picker or YYYY-MM-DD date format.");
  }

  return value;
}

function todayInSingapore() {
  const parts = new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Singapore",
    year: "numeric"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function revalidateLifecyclePages() {
  revalidatePath("/students");
  revalidatePath("/withdrawals");
}

function redirectWithError(message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`/withdrawals?${params.toString()}`);
}

function redirectWithSuccess(message: string): never {
  const params = new URLSearchParams({ saved: message });
  redirect(`/withdrawals?${params.toString()}`);
}
