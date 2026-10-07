import { createClient } from "@/lib/supabase/server";
import type { CustomerEnquiry, EnquiryStatus, EnquiryType } from "@/types/enquiry";

export type CustomerEnquiryRow = {
  merged_into?: string | null;
  id: string;
  parent_name: string;
  phone: string | null;
  email: string | null;
  child_name: string | null;
  child_age: string | null;
  centre_name: string | null;
  programme: string | null;
  enquiry_type: EnquiryType;
  status: EnquiryStatus;
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
  external_ticket_id?: string | null;
  google_sheet_row_id?: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  closed_by: string | null;
};

export type CustomerEnquiriesResult = {
  enquiries: CustomerEnquiry[];
  error?: string;
};

export const enquiryColumns = "*";

export async function getCustomerEnquiries(exactId?: string): Promise<CustomerEnquiriesResult> {
  const supabase = createClient();
  let query = supabase
    .from("customer_enquiries")
    .select(enquiryColumns)
    .is("merged_into", null)
    .order("enquiry_received_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);
  // Direct links from the skip queue must also find records older than the latest 500.
  if (exactId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(exactId)) {
    const lookup = await supabase.from("customer_enquiries").select("*").eq("id", exactId).maybeSingle<CustomerEnquiryRow>();
    query = query.eq("id", lookup.data?.merged_into || exactId);
  }
  const { data, error } = await query;

  if (error) {
    return {
      enquiries: [],
      error: error.message
    };
  }

  return {
    enquiries: ((data ?? []) as unknown as CustomerEnquiryRow[]).filter(row => !row.merged_into).map(mapCustomerEnquiry)
  };
}

export function mapCustomerEnquiry(row: CustomerEnquiryRow): CustomerEnquiry {
  return {
    id: row.id,
    parentName: row.parent_name,
    phone: row.phone,
    email: row.email,
    childName: row.child_name,
    childAge: row.child_age,
    centreName: row.centre_name,
    programme: row.programme,
    enquiryType: row.enquiry_type,
    status: row.status,
    source: row.source,
    message: row.message,
    enquiryReceivedAt: row.enquiry_received_at,
    firstTouchDate: row.first_touch_date,
    trialTime: row.trial_time,
    trialDetails: row.trial_details,
    trialDate: row.trial_date,
    trialLocation: row.trial_location,
    trialCoach: row.trial_coach,
    registrationDate: row.registration_date,
    signedUpLocation: row.signed_up_location,
    signedUpCoach: row.signed_up_coach,
    outcomeNotes: row.outcome_notes,
    assignedTo: row.assigned_to,
    notes: row.notes,
    respondioContactId: row.respondio_contact_id,
    respondioConversationId: row.respondio_conversation_id,
    externalTicketId: row.external_ticket_id ?? row.google_sheet_row_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    closedBy: row.closed_by
  };
}
