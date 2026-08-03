import { createClient } from "@/lib/supabase/server";
import type { CustomerEnquiry, EnquiryStatus, EnquiryType } from "@/types/enquiry";

type CustomerEnquiryRow = {
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
  assigned_to: string | null;
  notes: string | null;
  respondio_contact_id: string | null;
  respondio_conversation_id: string | null;
  google_sheet_row_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  closed_by: string | null;
};

export type CustomerEnquiriesResult = {
  enquiries: CustomerEnquiry[];
  error?: string;
};

const enquiryColumns = [
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
  "assigned_to",
  "notes",
  "respondio_contact_id",
  "respondio_conversation_id",
  "google_sheet_row_id",
  "created_at",
  "updated_at",
  "closed_at",
  "closed_by"
].join(", ");

export async function getCustomerEnquiries(): Promise<CustomerEnquiriesResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customer_enquiries")
    .select(enquiryColumns)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return {
      enquiries: [],
      error: error.message
    };
  }

  return {
    enquiries: ((data ?? []) as unknown as CustomerEnquiryRow[]).map(mapCustomerEnquiry)
  };
}

function mapCustomerEnquiry(row: CustomerEnquiryRow): CustomerEnquiry {
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
    assignedTo: row.assigned_to,
    notes: row.notes,
    respondioContactId: row.respondio_contact_id,
    respondioConversationId: row.respondio_conversation_id,
    googleSheetRowId: row.google_sheet_row_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    closedBy: row.closed_by
  };
}
