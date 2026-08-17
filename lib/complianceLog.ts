export const complianceCategories = [
  "Safeguarding",
  "Incident",
  "Data privacy",
  "Operations",
  "Finance claims",
  "Staff access",
  "Training",
  "Customer student",
  "Other"
] as const;

export const complianceSeverities = ["Low", "Medium", "High", "Critical"] as const;
export const complianceStatuses = ["Open", "Monitoring", "Resolved", "Archived"] as const;

export type ComplianceCategory = (typeof complianceCategories)[number];
export type ComplianceSeverity = (typeof complianceSeverities)[number];
export type ComplianceStatus = (typeof complianceStatuses)[number];

export type ComplianceLogEntry = {
  actionTaken: string | null;
  category: ComplianceCategory;
  centreName: string | null;
  createdAt: string;
  createdByEmail: string | null;
  createdByName: string | null;
  details: string;
  followUpDueDate: string | null;
  followUpOwner: string | null;
  id: string;
  loggedAt: string;
  resolvedAt: string | null;
  severity: ComplianceSeverity;
  status: ComplianceStatus;
  subject: string;
  updatedAt: string;
  updatedByEmail: string | null;
  updatedByName: string | null;
};

export function isComplianceCategory(value: string): value is ComplianceCategory {
  return complianceCategories.includes(value as ComplianceCategory);
}

export function isComplianceSeverity(value: string): value is ComplianceSeverity {
  return complianceSeverities.includes(value as ComplianceSeverity);
}

export function isComplianceStatus(value: string): value is ComplianceStatus {
  return complianceStatuses.includes(value as ComplianceStatus);
}
