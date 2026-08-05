export type StudentLifecycleStatus = "active" | "frozen" | "withdrawn";

export type StudentProfile = {
  id: string;
  studentName: string;
  parentName: string | null;
  phone: string | null;
  email: string | null;
  centreName: string | null;
  coachName: string | null;
  programme: string | null;
  status: StudentLifecycleStatus;
  startDate: string | null;
  statusEffectiveDate: string | null;
  reason: string | null;
  notes: string | null;
  sourceEnquiryId: string | null;
  createdAt: string;
  updatedAt: string;
};

export const studentLifecycleStatuses: StudentLifecycleStatus[] = [
  "active",
  "frozen",
  "withdrawn"
];

export function formatStudentLifecycleStatus(status: StudentLifecycleStatus) {
  if (status === "frozen") {
    return "Freeze";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function isStudentLifecycleStatus(value: string): value is StudentLifecycleStatus {
  return studentLifecycleStatuses.includes(value as StudentLifecycleStatus);
}
