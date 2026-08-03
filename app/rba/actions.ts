"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isStaffRole, type StaffRole } from "@/lib/staffRoles";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

type SupabaseClient = ReturnType<typeof createClient>;

export async function createStaffProfileAction(formData: FormData) {
  const { profile: currentProfile } = await requireAdminProfile();
  const supabase = createClient();
  const email = getRequiredText(formData, "email");
  const fullName = getRequiredText(formData, "fullName");
  const role = getStaffRole(formData);
  const coachName = getOptionalText(formData, "coachName");
  const assignedCentres = getCentreList(formData);
  const active = formData.getAll("active").includes("true");

  if (role === "lead_coach" && assignedCentres.length === 0) {
    redirectWithError("Lead coaches need at least one assigned centre.");
  }

  const { data: staffProfileId, error } = await supabase.rpc("admin_upsert_staff_profile", {
    target_active: active,
    target_centre_name: role === "lead_coach" ? assignedCentres[0] ?? null : null,
    target_coach_name: coachName || null,
    target_email: email,
    target_full_name: fullName,
    target_role: role
  });

  if (error || !staffProfileId) {
    redirectWithError(getStaffProfileErrorMessage(error?.message));
  }

  if (staffProfileId === currentProfile.id && (!active || role !== "admin")) {
    redirectWithError("You cannot remove admin access from your own account.");
  }

  const centreError = await replaceStaffCentres(
    supabase,
    String(staffProfileId),
    role === "lead_coach" ? assignedCentres : []
  );

  if (centreError) {
    redirectWithError(centreError);
  }

  revalidatePath("/rba");
  redirectWithSuccess("Staff profile added.");
}

export async function updateStaffProfileAction(formData: FormData) {
  const { profile: currentProfile } = await requireAdminProfile();
  const supabase = createClient();
  const staffProfileId = getRequiredText(formData, "staffProfileId");
  const fullName = getRequiredText(formData, "fullName");
  const role = getStaffRole(formData);
  const coachName = getOptionalText(formData, "coachName");
  const assignedCentres = getCentreList(formData);
  const active = formData.getAll("active").includes("true");

  if (currentProfile.id === staffProfileId && (!active || role !== "admin")) {
    redirectWithError("You cannot remove admin access from your own account.");
  }

  if (role === "lead_coach" && assignedCentres.length === 0) {
    redirectWithError("Lead coaches need at least one assigned centre.");
  }

  const { error } = await supabase
    .from("staff_profiles")
    .update({
      active,
      centre_name: role === "lead_coach" ? assignedCentres[0] ?? null : null,
      coach_name: coachName || null,
      full_name: fullName,
      role
    })
    .eq("id", staffProfileId);

  if (error) {
    redirectWithError(error.message);
  }

  const centreError = await replaceStaffCentres(
    supabase,
    staffProfileId,
    role === "lead_coach" ? assignedCentres : []
  );

  if (centreError) {
    redirectWithError(centreError);
  }

  revalidatePath("/rba");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/quarter");
  redirectWithSuccess("Staff profile updated.");
}

async function requireAdminProfile() {
  const session = await requireActiveStaffSession();

  if (session.profile.role !== "admin") {
    redirect("/dashboard");
  }

  return session;
}

async function replaceStaffCentres(
  supabase: SupabaseClient,
  staffProfileId: string,
  centreNames: string[]
) {
  const { error: deleteError } = await supabase
    .from("staff_profile_centres")
    .delete()
    .eq("staff_profile_id", staffProfileId);

  if (deleteError) {
    return deleteError.message;
  }

  if (centreNames.length === 0) {
    return null;
  }

  const { error: insertError } = await supabase.from("staff_profile_centres").insert(
    centreNames.map((centreName) => ({
      centre_name: centreName,
      staff_profile_id: staffProfileId
    }))
  );

  return insertError?.message ?? null;
}

function getStaffRole(formData: FormData): StaffRole {
  const role = getRequiredText(formData, "role");

  if (!isStaffRole(role)) {
    redirectWithError("Choose a valid staff role.");
  }

  return role;
}

function getCentreList(formData: FormData) {
  const centreText = getOptionalText(formData, "assignedCentres");

  return Array.from(
    new Set(
      centreText
        .split(/[\n,]+/)
        .map((centreName) => centreName.trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
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

function getStaffProfileErrorMessage(message = "Unable to save staff profile.") {
  if (message.toLowerCase().includes("admin_upsert_staff_profile")) {
    return "Run the latest Supabase SQL setup first, then try adding the staff profile again.";
  }

  return message;
}

function redirectWithError(message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`/rba?${params.toString()}`);
}

function redirectWithSuccess(message: string): never {
  const params = new URLSearchParams({ saved: message });
  redirect(`/rba?${params.toString()}`);
}
