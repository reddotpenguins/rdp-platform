"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isComplianceCategory,
  isComplianceSeverity,
  isComplianceStatus
} from "@/lib/complianceLog";
import { canViewAuditLog } from "@/lib/staffRoles";
import { createClient } from "@/lib/supabase/server";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

type SupabaseClient = ReturnType<typeof createClient>;

export async function createComplianceLogAction(formData: FormData) {
  const { profile } = await requireComplianceAccess();
  const supabase = createClient();
  const organisationId = await getOrganisationId(supabase);
  const category = getCategory(formData);
  const severity = getSeverity(formData);
  const status = getStatus(formData);
  const subject = getRequiredText(formData, "subject");
  const details = getRequiredText(formData, "details");
  const loggedAt = getOptionalDateTime(formData, "loggedAt") ?? new Date().toISOString();
  const followUpDueDate = getOptionalDate(formData, "followUpDueDate");
  const resolvedAt = status === "Resolved" || status === "Archived" ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from("compliance_log_entries")
    .insert({
      action_taken: getOptionalText(formData, "actionTaken") || null,
      category,
      centre_name: getOptionalText(formData, "centreName") || null,
      created_by: profile.id,
      details,
      follow_up_due_date: followUpDueDate,
      follow_up_owner: getOptionalText(formData, "followUpOwner") || null,
      logged_at: loggedAt,
      organisation_id: organisationId,
      resolved_at: resolvedAt,
      severity,
      status,
      subject,
      updated_by: profile.id
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    redirectWithError(error?.message ?? "Compliance log entry could not be saved.");
  }

  await writeComplianceAuditEvent(supabase, {
    actorStaffId: profile.id,
    entityId: data.id,
    eventType: "compliance.created",
    metadata: { category, loggedAt, severity, status, subject },
    organisationId
  });

  revalidatePath("/compliance");
  redirectWithSuccess("Compliance log entry added.");
}

export async function updateComplianceLogStatusAction(formData: FormData) {
  const { profile } = await requireComplianceAccess();
  const supabase = createClient();
  const organisationId = await getOrganisationId(supabase);
  const entryId = getRequiredText(formData, "entryId");
  const status = getStatus(formData);
  const resolvedAt = status === "Resolved" || status === "Archived" ? new Date().toISOString() : null;
  const actionTaken = getOptionalText(formData, "actionTaken");
  const followUpDueDate = getOptionalDate(formData, "followUpDueDate");
  const followUpOwner = getOptionalText(formData, "followUpOwner");
  const { error } = await supabase
    .from("compliance_log_entries")
    .update({
      action_taken: actionTaken || null,
      follow_up_due_date: followUpDueDate,
      follow_up_owner: followUpOwner || null,
      resolved_at: resolvedAt,
      status,
      updated_at: new Date().toISOString(),
      updated_by: profile.id
    })
    .eq("id", entryId)
    .eq("organisation_id", organisationId);

  if (error) {
    redirectWithError(error.message);
  }

  await writeComplianceAuditEvent(supabase, {
    actorStaffId: profile.id,
    entityId: entryId,
    eventType: "compliance.status_updated",
    metadata: { status },
    organisationId
  });

  revalidatePath("/compliance");
  redirectWithSuccess("Compliance log status updated.");
}

async function requireComplianceAccess() {
  const session = await requireActiveStaffSession();

  if (!canViewAuditLog(session.profile)) {
    redirect("/dashboard");
  }

  return session;
}

async function getOrganisationId(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("organisations")
    .select("id")
    .eq("slug", "red-dot-penguins")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    redirectWithError("Run supabase/compliance-log.sql in Supabase before using this page.");
  }

  return data.id;
}

async function writeComplianceAuditEvent(
  supabase: SupabaseClient,
  values: {
    actorStaffId: string;
    entityId: string;
    eventType: string;
    metadata: Record<string, unknown>;
    organisationId: string;
  }
) {
  await supabase.from("audit_events").insert({
    actor_staff_id: values.actorStaffId,
    entity_id: values.entityId,
    entity_type: "compliance_log_entry",
    event_type: values.eventType,
    metadata: values.metadata,
    organisation_id: values.organisationId
  });
}

function getCategory(formData: FormData) {
  const category = getRequiredText(formData, "category");

  if (!isComplianceCategory(category)) {
    redirectWithError("Choose a valid compliance category.");
  }

  return category;
}

function getSeverity(formData: FormData) {
  const severity = getRequiredText(formData, "severity");

  if (!isComplianceSeverity(severity)) {
    redirectWithError("Choose a valid severity.");
  }

  return severity;
}

function getStatus(formData: FormData) {
  const status = getRequiredText(formData, "status");

  if (!isComplianceStatus(status)) {
    redirectWithError("Choose a valid status.");
  }

  return status;
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

function getOptionalDateTime(formData: FormData, key: string) {
  const value = getOptionalText(formData, key);

  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    redirectWithError("Use the date and time picker for logged date/time.");
  }

  return new Date(`${value}:00+08:00`).toISOString();
}

function redirectWithError(message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`/compliance?${params.toString()}`);
}

function redirectWithSuccess(message: string): never {
  const params = new URLSearchParams({ message });
  redirect(`/compliance?${params.toString()}`);
}
