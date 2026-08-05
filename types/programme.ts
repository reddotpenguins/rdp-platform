export const programmeOptions = [
  "Learn to Swim",
  "Race Team",
  "Baby Class",
  "Social Swim Club"
] as const;

export type Programme = (typeof programmeOptions)[number];

export function getProgrammeSelectOptions(currentValue?: string | null) {
  const trimmedValue = currentValue?.trim();
  const options = ["", ...programmeOptions];

  if (!trimmedValue || programmeOptions.includes(trimmedValue as Programme)) {
    return options;
  }

  return ["", trimmedValue, ...programmeOptions];
}

export function formatProgrammeOption(programme: string) {
  return programme || "Not set";
}
