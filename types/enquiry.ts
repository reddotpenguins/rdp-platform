export type EnquiryType = "enquiry" | "trial" | "sign_up";

export type EnquiryStatus =
  | "new"
  | "contacted"
  | "trial_booked"
  | "signed_up"
  | "closed";

export type CustomerEnquiry = {
  id: string;
  parentName: string;
  phone: string | null;
  email: string | null;
  childName: string | null;
  childAge: string | null;
  centreName: string | null;
  programme: string | null;
  enquiryType: EnquiryType;
  status: EnquiryStatus;
  source: string | null;
  message: string | null;
  assignedTo: string | null;
  notes: string | null;
  respondioContactId: string | null;
  respondioConversationId: string | null;
  googleSheetRowId: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  closedBy: string | null;
};

export const enquiryTypes: EnquiryType[] = ["enquiry", "trial", "sign_up"];

export const enquiryStatuses: EnquiryStatus[] = [
  "new",
  "contacted",
  "trial_booked",
  "signed_up",
  "closed"
];

export function formatEnquiryType(type: EnquiryType) {
  if (type === "sign_up") {
    return "Sign up";
  }

  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function formatEnquiryStatus(status: EnquiryStatus) {
  if (status === "trial_booked") {
    return "Trial booked";
  }

  if (status === "signed_up") {
    return "Signed up";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function isEnquiryStatus(value: string): value is EnquiryStatus {
  return enquiryStatuses.includes(value as EnquiryStatus);
}
