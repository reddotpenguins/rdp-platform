import {
  isComplianceCategory,
  isComplianceSeverity,
  isComplianceStatus,
  type ComplianceLogEntry
} from "@/lib/complianceLog";
import { createClient } from "@/lib/supabase/server";

type ComplianceLogRow = {
  action_taken: string | null;
  category: string;
  centre_name: string | null;
  created_at: string;
  created_by: string | null;
  details: string;
  follow_up_due_date: string | null;
  follow_up_owner: string | null;
  id: string;
  logged_at: string;
  resolved_at: string | null;
  severity: string;
  status: string;
  subject: string;
  updated_at: string;
  updated_by: string | null;
};

type StaffRow = {
  email: string;
  full_name: string;
  id: string;
};

export type ComplianceLogResult = {
  entries: ComplianceLogEntry[];
  error?: string;
};

export const complianceLogColumns = [
  "id",
  "logged_at",
  "category",
  "severity",
  "status",
  "centre_name",
  "subject",
  "details",
  "action_taken",
  "follow_up_owner",
  "follow_up_due_date",
  "resolved_at",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at"
].join(", ");

export async function getComplianceLogEntries(): Promise<ComplianceLogResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("compliance_log_entries")
    .select(complianceLogColumns)
    .order("logged_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return {
      entries: [],
      error: getComplianceLogErrorMessage(error.message)
    };
  }

  const rows = (data ?? []) as unknown as ComplianceLogRow[];
  const staffById = await getStaffLookup(
    Array.from(
      new Set(
        rows
          .flatMap((row) => [row.created_by, row.updated_by])
          .filter((staffId): staffId is string => Boolean(staffId))
      )
    )
  );

  return {
    entries: rows.map((row) => mapComplianceLogEntry(row, staffById))
  };
}

function mapComplianceLogEntry(
  row: ComplianceLogRow,
  staffById: Map<string, StaffRow>
): ComplianceLogEntry {
  const createdBy = row.created_by ? staffById.get(row.created_by) : undefined;
  const updatedBy = row.updated_by ? staffById.get(row.updated_by) : undefined;
  const category = isComplianceCategory(row.category) ? row.category : "Other";
  const severity = isComplianceSeverity(row.severity) ? row.severity : "Medium";
  const status = isComplianceStatus(row.status) ? row.status : "Open";

  return {
    actionTaken: row.action_taken,
    category,
    centreName: row.centre_name,
    createdAt: row.created_at,
    createdByEmail: createdBy?.email ?? null,
    createdByName: createdBy?.full_name ?? null,
    details: row.details,
    followUpDueDate: row.follow_up_due_date,
    followUpOwner: row.follow_up_owner,
    id: row.id,
    loggedAt: row.logged_at,
    resolvedAt: row.resolved_at,
    severity,
    status,
    subject: row.subject,
    updatedAt: row.updated_at,
    updatedByEmail: updatedBy?.email ?? null,
    updatedByName: updatedBy?.full_name ?? null
  };
}

async function getStaffLookup(staffIds: string[]) {
  const staffById = new Map<string, StaffRow>();

  if (staffIds.length === 0) {
    return staffById;
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("staff_profiles")
    .select("id, full_name, email")
    .in("id", staffIds);

  ((data ?? []) as StaffRow[]).forEach((staff) => {
    staffById.set(staff.id, staff);
  });

  return staffById;
}

function getComplianceLogErrorMessage(message: string) {
  if (message.includes("compliance_log_entries") || message.includes("organisations")) {
    return "Run supabase/compliance-log.sql in Supabase before using this page.";
  }

  return message;
}
