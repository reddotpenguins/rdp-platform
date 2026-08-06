"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageCustomerEnquiries } from "@/lib/staffRoles";
import { createClient } from "@/lib/supabase/server";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";
import { isEnquiryStatus, isEnquiryType } from "@/types/enquiry";

type CustomerEnquirySyncRow = {
  id: string;
  parent_name: string;
  phone: string | null;
  email: string | null;
  child_name: string | null;
  child_age: string | null;
  centre_name: string | null;
  programme: string | null;
  enquiry_type: string;
  status: string;
  source: string | null;
  message: string | null;
  enquiry_received_at: string | null;
  first_touch_date: string | null;
  trial_time: string | null;
  trial_details: string | null;
  trial_date: string | null;
  trial_location: string | null;
  trial_coach: string | null;
  registration_date: string | null;
  signed_up_location: string | null;
  signed_up_coach: string | null;
  outcome_notes: string | null;
  assigned_to: string | null;
  notes: string | null;
  respondio_contact_id: string | null;
  respondio_conversation_id: string | null;
  google_sheet_row_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

const syncSelectColumns = [
  "id",
  "parent_name",
  "phone",
  "email",
  "child_name",
  "child_age",
  "centre_name",
  "programme",
  "enquiry_type",
  "status",
  "source",
  "message",
  "enquiry_received_at",
  "first_touch_date",
  "trial_time",
  "trial_details",
  "trial_date",
  "trial_location",
  "trial_coach",
  "registration_date",
  "signed_up_location",
  "signed_up_coach",
  "outcome_notes",
  "assigned_to",
  "notes",
  "respondio_contact_id",
  "respondio_conversation_id",
  "google_sheet_row_id",
  "created_at",
  "updated_at",
  "closed_at"
].join(", ");

export async function updateEnquiryTicketAction(formData: FormData) {
  const { profile } = await requireActiveStaffSession();

  if (!canManageCustomerEnquiries(profile)) {
    redirect("/dashboard");
  }

  const returnQuery = getOptionalText(formData, "returnQuery");
  const enquiryId = getRequiredText(formData, "enquiryId", returnQuery);
  const status =
    getOptionalText(formData, "statusOverride") || getRequiredText(formData, "status", returnQuery);
  const enquiryType = getRequiredText(formData, "enquiryType", returnQuery);
  const notes = getOptionalText(formData, "notes");
  const trialLocation = getOptionalText(formData, "trialLocation");
  const signedUpLocation = getOptionalText(formData, "signedUpLocation");
  const existingCentreName = getOptionalText(formData, "centreName");
  const trialCoach = getOptionalText(formData, "trialCoach");

  if (!isEnquiryStatus(status)) {
    redirectWithError("Choose a valid enquiry status.", returnQuery);
  }

  if (!isEnquiryType(enquiryType)) {
    redirectWithError("Choose a valid enquiry type.", returnQuery);
  }

  const isClosed = status === "closed";
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customer_enquiries")
    .update({
      assigned_to: trialCoach || null,
      centre_name: trialLocation || signedUpLocation || existingCentreName || null,
      closed_at: isClosed ? new Date().toISOString() : null,
      closed_by: isClosed ? profile.id : null,
      enquiry_type: enquiryType,
      first_touch_date: getOptionalDate(formData, "firstTouchDate", returnQuery),
      notes: notes || null,
      outcome_notes: getOptionalText(formData, "outcomeNotes") || null,
      programme: getOptionalText(formData, "programme") || null,
      registration_date: getOptionalDate(formData, "registrationDate", returnQuery),
      signed_up_coach: getOptionalText(formData, "signedUpCoach") || null,
      signed_up_location: signedUpLocation || null,
      status,
      trial_coach: trialCoach || null,
      trial_date: getOptionalDate(formData, "trialDate", returnQuery),
      trial_details: getOptionalText(formData, "trialDetails") || null,
      trial_location: trialLocation || null,
      trial_time: getOptionalText(formData, "trialTime") || null,
      updated_at: new Date().toISOString()
    })
    .eq("id", enquiryId)
    .select(syncSelectColumns)
    .single<CustomerEnquirySyncRow>();

  if (error) {
    redirectWithError(error.message, returnQuery);
  }

  const syncWarning = await syncEnquiryUpdateToMake(data);

  revalidatePath("/enquiries");
  redirectWithSuccess(
    `${isClosed ? "Ticket closed." : "Ticket updated."}${syncWarning ?? ""}`,
    returnQuery
  );
}

function getRequiredText(formData: FormData, key: string, returnQuery: string) {
  const value = getOptionalText(formData, key);

  if (!value) {
    redirectWithError("Please fill in all required fields.", returnQuery);
  }

  return value;
}

function getOptionalText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getOptionalDate(formData: FormData, key: string, returnQuery: string) {
  const value = getOptionalText(formData, key);

  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    redirectWithError("Use the date picker or YYYY-MM-DD date format.", returnQuery);
  }

  return value;
}

async function syncEnquiryUpdateToMake(row: CustomerEnquirySyncRow | null) {
  const webhookUrl = process.env.MAKE_ENQUIRY_UPDATE_WEBHOOK_URL?.trim();

  if (!webhookUrl || !row) {
    return null;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ticketId: row.id,
        googleSheetRowId: row.google_sheet_row_id,
        respondioConversationId: row.respondio_conversation_id,
        respondioContactId: row.respondio_contact_id,
        timeStamp: row.enquiry_received_at ?? row.created_at,
        name: row.parent_name,
        number: row.phone,
        email: row.email,
        childName: row.child_name,
        childAge: row.child_age,
        enquiryType: row.enquiry_type,
        programme: row.programme,
        status: row.status,
        firstMessage: row.message,
        firstTouchDate: row.first_touch_date,
        trialTime: row.trial_time,
        trialDetailsComments: row.trial_details,
        trialDate: row.trial_date,
        trialLocation: row.trial_location ?? row.centre_name,
        trialCoach: row.trial_coach ?? row.assigned_to,
        registrationDate: row.registration_date,
        signedUpLocation: row.signed_up_location,
        signedUpCoach: row.signed_up_coach,
        outcomeDetails: row.outcome_notes,
        source: row.source,
        websiteNotes: row.notes,
        closedAt: row.closed_at,
        updatedAt: row.updated_at
      })
    });

    if (!response.ok) {
      return " Google Sheet sync failed; check the Make webhook run history.";
    }
  } catch {
    return " Google Sheet sync failed; check the Make webhook run history.";
  }

  return null;
}

function redirectWithError(message: string, returnQuery = ""): never {
  redirect(buildEnquiriesRedirectUrl("error", message, returnQuery));
}

function redirectWithSuccess(message: string, returnQuery = ""): never {
  redirect(buildEnquiriesRedirectUrl("saved", message, returnQuery));
}

function buildEnquiriesRedirectUrl(
  messageKey: "error" | "saved",
  message: string,
  returnQuery: string
) {
  const params = new URLSearchParams(returnQuery);

  params.delete("error");
  params.delete("saved");
  params.set(messageKey, message);

  return `/enquiries?${params.toString()}`;
}
