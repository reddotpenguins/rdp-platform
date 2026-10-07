export const mergeFields = [
  [
    "parent_name",
    "Parent name"
  ],
  [
    "phone",
    "Phone"
  ],
  [
    "email",
    "Email"
  ],
  [
    "child_name",
    "Child name"
  ],
  [
    "child_age",
    "Child age"
  ],
  [
    "centre_name",
    "Centre"
  ],
  [
    "programme",
    "Programme"
  ],
  [
    "enquiry_type",
    "Ticket type"
  ],
  [
    "status",
    "Status"
  ],
  [
    "source",
    "Source"
  ],
  [
    "message",
    "Message"
  ],
  [
    "enquiry_received_at",
    "Received at"
  ],
  [
    "first_touch_date",
    "First touch date"
  ],
  [
    "trial_time",
    "Trial time"
  ],
  [
    "trial_details",
    "Trial details"
  ],
  [
    "trial_date",
    "Trial date"
  ],
  [
    "trial_location",
    "Trial location"
  ],
  [
    "trial_coach",
    "Trial coach"
  ],
  [
    "registration_date",
    "Registration date"
  ],
  [
    "signed_up_location",
    "Signed up location"
  ],
  [
    "signed_up_coach",
    "Signed up coach"
  ],
  [
    "outcome_notes",
    "Outcome notes"
  ],
  [
    "assigned_to",
    "Assigned to"
  ],
  [
    "notes",
    "Notes"
  ]
] as const;
export type MergeField = typeof mergeFields[number][0];
export type MergeChoice = "target" | "source" | "combine";
export const combinedMergeFields = ["message", "notes", "trial_details", "outcome_notes"] as const;
export function canCombineMergeField(field: string) {
  return (combinedMergeFields as readonly string[]).includes(field);
}
export function isTicketId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export function phoneMatchKey(value: string | null | undefined) {
  if (!value || !/^\+?[\d\s().-]+$/.test(value.trim())) return "";
  return value.replace(/\D/g, "");
}
export function normaliseMergedPhone(value: string | null | undefined) {
  const digits = phoneMatchKey(value);
  if (digits.length === 10 && digits.startsWith("65")) return "+" + digits;
  return value || null;
}
export function defaultMergeChoice(field: string, target: unknown, source: unknown): MergeChoice {
  const blank = (value: unknown) => value == null || value === "";
  if (blank(target) && !blank(source)) return "source";
  if (canCombineMergeField(field) && !blank(target) && !blank(source) && target !== source) return "combine";
  return "target";
}
export function validateMergeChoices(choices: Record<string, string>) {
  const keys = new Set<string>(mergeFields.map(([key]) => key));
  if (Object.keys(choices).length !== keys.size) return false;
  return Object.entries(choices).every(([key, value]) =>
    keys.has(key) && (value === "target" || value === "source" || (value === "combine" && canCombineMergeField(key))));
}

