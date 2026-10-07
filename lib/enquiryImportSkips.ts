export const skipDecisions = {
  needs_review: "Needs review",
  existing_record: "Already in database",
  add_to_database: "Needs adding to database",
  not_needed: "Not needed"
} as const;

export type SkipDecision = keyof typeof skipDecisions;

export function isSkipDecision(value: string): value is SkipDecision {
  return Object.prototype.hasOwnProperty.call(skipDecisions, value);
}

export function validateSkipReview(id: string, decision: string, notes: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return "Choose a valid skipped import.";
  if (!isSkipDecision(decision)) return "Choose a valid review decision.";
  if (!notes.trim() || notes.trim().length > 4000) return "Add review notes between 1 and 4,000 characters.";
  return null;
}

export function skipQueuePage(value: string | undefined) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1;
}

export function escapeSkipSearch(value: string) {
  return value.trim().slice(0, 200).replace(/[\\%_]/g, "\\$&");
}
