"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createOptionalSupabaseAdminClient } from "@/lib/supabase/admin";
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

  const adminClient = createOptionalSupabaseAdminClient();

  if (!adminClient) {
    redirectWithError(
      "Add SUPABASE_SERVICE_ROLE_KEY in Vercel first so the website can send Supabase invite emails."
    );
  }

  const inviteResult = await inviteAuthUser(adminClient, email, fullName);

  if (inviteResult.status === "error") {
    redirectWithError(inviteResult.message);
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
  redirectWithSuccess(
    inviteResult.status === "invited"
      ? "Invitation email sent and staff profile added."
      : "Staff profile added. Supabase Auth user already exists for this email."
  );
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

export async function deleteStaffProfileAction(formData: FormData) {
  const { profile: currentProfile } = await requireAdminProfile();
  const staffProfileId = getRequiredText(formData, "staffProfileId");

  if (currentProfile.id === staffProfileId) {
    redirectWithError("You cannot delete your own current admin profile.");
  }

  const adminClient = createOptionalSupabaseAdminClient();

  if (adminClient) {
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(staffProfileId);

    if (!authDeleteError) {
      revalidateStaffPages();
      redirectWithSuccess("User deleted.");
    }

    if (!isMissingAuthUserError(authDeleteError.message)) {
      redirectWithError(authDeleteError.message);
    }
  }

  const supabase = createClient();
  const { error } = await supabase.from("staff_profiles").delete().eq("id", staffProfileId);

  if (error) {
    redirectWithError(error.message);
  }

  revalidateStaffPages();
  redirectWithSuccess(
    adminClient
      ? "Staff access removed. The Supabase Auth login was already missing."
      : "Staff access removed. Add SUPABASE_SERVICE_ROLE_KEY in Vercel to delete the Supabase Auth login too."
  );
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

function revalidateStaffPages() {
  revalidatePath("/rba");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/quarter");
  revalidatePath("/upload");
  revalidatePath("/enquiries");
}

async function inviteAuthUser(
  adminClient: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>,
  email: string,
  fullName: string
) {
  const { error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName
    },
    redirectTo: getInviteRedirectUrl()
  });

  if (!error) {
    return { status: "invited" as const };
  }

  if (isExistingAuthUserError(error.message)) {
    return { status: "exists" as const };
  }

  return {
    status: "error" as const,
    message: error.message
  };
}

function getInviteRedirectUrl() {
  const requestHeaders = headers();
  const origin = requestHeaders.get("origin");

  if (origin?.startsWith("http://") || origin?.startsWith("https://")) {
    return `${origin}/auth/callback?next=/auth/set-password`;
  }

  const forwardedHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto") ?? "https";

  if (forwardedHost) {
    return `${forwardedProtocol}://${forwardedHost}/auth/callback?next=/auth/set-password`;
  }

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

  if (vercelUrl) {
    return `https://${vercelUrl.replace(/^https?:\/\//, "")}/auth/callback?next=/auth/set-password`;
  }

  redirectWithError("Unable to build the invite redirect URL. Check your Vercel deployment URL.");
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

function isMissingAuthUserError(message: string) {
  const normalized = message.toLowerCase();

  return normalized.includes("not found") || normalized.includes("does not exist");
}

function isExistingAuthUserError(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("already") ||
    normalized.includes("registered") ||
    normalized.includes("exists")
  );
}

function redirectWithError(message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`/rba?${params.toString()}`);
}

function redirectWithSuccess(message: string): never {
  const params = new URLSearchParams({ saved: message });
  redirect(`/rba?${params.toString()}`);
}
