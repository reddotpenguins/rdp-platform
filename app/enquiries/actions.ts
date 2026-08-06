"use server";

import { redirect } from "next/navigation";
import { canManageCustomerEnquiries } from "@/lib/staffRoles";
import {
  enquiryColumns,
  mapCustomerEnquiry,
  type CustomerEnquiryRow
} from "@/lib/supabase/enquiries";
import { createClient } from "@/lib/supabase/server";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";
import type { CustomerEnquiry } from "@/types/enquiry";
import { isEnquiryStatus, isEnquiryType } from "@/types/enquiry";

export type UpdateEnquiryTicketResult =
  | {
      enquiry: CustomerEnquiry;
      message: string;
      ok: true;
    }
  | {
      error: string;
      ok: false;
    };

export async function updateEnquiryTicketAction(
  formData: FormData
): Promise<UpdateEnquiryTicketResult> {
  const { profile } = await requireActiveStaffSession();

  if (!canManageCustomerEnquiries(profile)) {
    redirect("/dashboard");
  }

  const enquiryId = getRequiredText(formData, "enquiryId");
  const status = getOptionalText(formData, "statusOverride") || getRequiredText(formData, "status");
  const selectedEnquiryType = getRequiredText(formData, "enquiryType");
  const enquiryType = status === "signed_up" ? "sign_up" : selectedEnquiryType;
  const notes = getOptionalText(formData, "notes");
  const trialLocation = getOptionalText(formData, "trialLocation");
  const signedUpLocation = getOptionalText(formData, "signedUpLocation");
  const existingCentreName = getOptionalText(formData, "centreName");
  const trialCoach = getOptionalText(formData, "trialCoach");

  if (!isEnquiryStatus(status)) {
    return { error: "Choose a valid enquiry status.", ok: false };
  }

  if (!isEnquiryType(enquiryType)) {
    return { error: "Choose a valid enquiry type.", ok: false };
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
      first_touch_date: getOptionalDate(formData, "firstTouchDate"),
      notes: notes || null,
      outcome_notes: getOptionalText(formData, "outcomeNotes") || null,
      programme: getOptionalText(formData, "programme") || null,
      registration_date: getOptionalDate(formData, "registrationDate"),
      signed_up_coach: getOptionalText(formData, "signedUpCoach") || null,
      signed_up_location: signedUpLocation || null,
      status,
      trial_coach: trialCoach || null,
      trial_date: getOptionalDate(formData, "trialDate"),
      trial_details: getOptionalText(formData, "trialDetails") || null,
      trial_location: trialLocation || null,
      trial_time: getOptionalText(formData, "trialTime") || null,
      updated_at: new Date().toISOString()
    })
    .eq("id", enquiryId)
    .select(enquiryColumns)
    .single<CustomerEnquiryRow>();

  if (error) {
    return { error: error.message, ok: false };
  }

  const syncWarning = await syncEnquiryUpdateToMake(data);
  const message = `${getUpdateMessage(status)}${syncWarning ?? ""}`;

  return {
    enquiry: mapCustomerEnquiry(data),
    message,
    ok: true
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

function getOptionalDate(formData: FormData, key: string) {
  const value = getOptionalText(formData, key);

  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Use the date picker or YYYY-MM-DD date format.");
  }

  return value;
}

async function syncEnquiryUpdateToMake(row: CustomerEnquiryRow | null) {
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

function getUpdateMessage(status: string) {
  if (status === "closed") {
    return "Ticket closed.";
  }

  if (status === "signed_up") {
    return "Ticket marked as signed up.";
  }

  return "Ticket updated.";
}
