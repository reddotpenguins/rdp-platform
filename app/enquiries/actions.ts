"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageCustomerEnquiries } from "@/lib/staffRoles";
import { createClient } from "@/lib/supabase/server";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";
import { isEnquiryStatus } from "@/types/enquiry";

export async function updateEnquiryTicketAction(formData: FormData) {
  const { profile } = await requireActiveStaffSession();

  if (!canManageCustomerEnquiries(profile)) {
    redirect("/dashboard");
  }

  const enquiryId = getRequiredText(formData, "enquiryId");
  const status = getOptionalText(formData, "statusOverride") || getRequiredText(formData, "status");
  const notes = getOptionalText(formData, "notes");

  if (!isEnquiryStatus(status)) {
    redirectWithError("Choose a valid enquiry status.");
  }

  const isClosed = status === "closed";
  const supabase = createClient();
  const { error } = await supabase
    .from("customer_enquiries")
    .update({
      closed_at: isClosed ? new Date().toISOString() : null,
      closed_by: isClosed ? profile.id : null,
      notes: notes || null,
      status,
      updated_at: new Date().toISOString()
    })
    .eq("id", enquiryId);

  if (error) {
    redirectWithError(error.message);
  }

  revalidatePath("/enquiries");
  redirectWithSuccess(isClosed ? "Ticket closed." : "Ticket updated.");
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

function redirectWithError(message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`/enquiries?${params.toString()}`);
}

function redirectWithSuccess(message: string): never {
  const params = new URLSearchParams({ saved: message });
  redirect(`/enquiries?${params.toString()}`);
}
