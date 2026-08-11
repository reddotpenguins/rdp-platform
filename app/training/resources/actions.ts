"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  canManageTrainingResources,
  type StaffProfile
} from "@/lib/staffRoles";
import {
  isTrainingResourceCategory,
  isTrainingResourceProgramme,
  isTrainingResourceStatus
} from "@/lib/trainingResources";
import { createClient } from "@/lib/supabase/server";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export async function saveTrainingResourceAction(formData: FormData) {
  const { profile } = await requireTrainingResourceAdmin();
  const supabase = createClient();
  const organisationId = await getOrganisationId();
  const resourceId = getOptionalText(formData, "resourceId");
  const values = getTrainingResourceFormValues(formData);
  const payload = {
    assessment_criteria: values.assessmentCriteria || null,
    category: values.category,
    common_mistakes: values.commonMistakes || null,
    description: values.description || null,
    level_label: values.levelLabel || null,
    organisation_id: organisationId,
    programme: values.programme,
    skill_type: values.skillType || null,
    sort_order: values.sortOrder,
    status: values.status,
    teaching_cues: values.teachingCues || null,
    title: values.title,
    updated_at: new Date().toISOString(),
    updated_by: profile.id,
    video_url: values.videoUrl || null
  };

  if (resourceId) {
    const { error } = await supabase
      .from("training_resources")
      .update(payload)
      .eq("id", resourceId)
      .eq("organisation_id", organisationId);

    if (error) {
      redirectWithTrainingResourceError(error.message);
    }

    revalidatePath("/training/resources");
    redirectWithTrainingResourceMessage("Training resource updated.");
  }

  const { error } = await supabase.from("training_resources").insert({
    ...payload,
    created_by: profile.id
  });

  if (error) {
    redirectWithTrainingResourceError(error.message);
  }

  revalidatePath("/training/resources");
  redirectWithTrainingResourceMessage("Training resource added.");
}

export async function deleteTrainingResourceAction(formData: FormData) {
  await requireTrainingResourceAdmin();
  const supabase = createClient();
  const organisationId = await getOrganisationId();
  const resourceId = getRequiredText(formData, "resourceId");
  const { error } = await supabase
    .from("training_resources")
    .delete()
    .eq("id", resourceId)
    .eq("organisation_id", organisationId);

  if (error) {
    redirectWithTrainingResourceError(error.message);
  }

  revalidatePath("/training/resources");
  redirectWithTrainingResourceMessage("Training resource deleted.");
}

async function requireTrainingResourceAdmin() {
  const session = await requireActiveStaffSession();

  if (!canManageTrainingResources(session.profile)) {
    redirect("/dashboard");
  }

  return session;
}

async function getOrganisationId() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("organisations")
    .select("id")
    .eq("slug", "red-dot-penguins")
    .single<{ id: string }>();

  if (error || !data) {
    redirectWithTrainingResourceError("Run the training resources SQL in Supabase before adding resources.");
  }

  return data.id;
}

function getTrainingResourceFormValues(formData: FormData) {
  const category = getRequiredText(formData, "category");
  const programme = getRequiredText(formData, "programme");
  const status = getRequiredText(formData, "status");

  if (!isTrainingResourceCategory(category)) {
    throw new Error("Choose a valid category.");
  }

  if (!isTrainingResourceProgramme(programme)) {
    throw new Error("Choose a valid programme.");
  }

  if (!isTrainingResourceStatus(status)) {
    throw new Error("Choose a valid status.");
  }

  return {
    assessmentCriteria: getOptionalText(formData, "assessmentCriteria"),
    category,
    commonMistakes: getOptionalText(formData, "commonMistakes"),
    description: getOptionalText(formData, "description"),
    levelLabel: getOptionalText(formData, "levelLabel"),
    programme,
    skillType: getOptionalText(formData, "skillType"),
    sortOrder: getPositiveInteger(formData, "sortOrder"),
    status,
    teachingCues: getOptionalText(formData, "teachingCues"),
    title: getRequiredText(formData, "title"),
    videoUrl: getOptionalText(formData, "videoUrl")
  };
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

function getPositiveInteger(formData: FormData, key: string) {
  const value = Number.parseInt(String(formData.get(key) ?? "100"), 10);

  return Number.isFinite(value) && value > 0 ? value : 100;
}

function redirectWithTrainingResourceMessage(message: string): never {
  redirect(`/training/resources?message=${encodeURIComponent(message)}`);
}

function redirectWithTrainingResourceError(error: string): never {
  redirect(`/training/resources?error=${encodeURIComponent(normalizeSupabaseError(error))}`);
}

function normalizeSupabaseError(error: string) {
  if (error.toLowerCase().includes("training_resources")) {
    return "Run the training resources SQL in Supabase before managing resources.";
  }

  return error;
}
