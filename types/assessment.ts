export type AssessmentResult = "Pass" | "Fail" | "Absent" | "Not Assessed" | "";

export type AssessmentQuarter = `Q${number}`;

export type AssessmentYear = string;

export type SessionPeriod = "AM" | "PM";

export type FlagStatus = "None" | "Yellow" | "Red";

export type ActionRequired =
  | "No immediate concern"
  | "Monitor"
  | "Intervention Required";

export type QuarterAssessmentDetails = {
  coachName?: string;
  centre?: string;
  level?: string;
  session?: string;
  result: AssessmentResult;
};

export type StudentAssessmentRecord = {
  id: string;
  studentCode?: string;
  studentName: string;
  coachName: string;
  centre?: string;
  level?: string;
  session?: string;
  assessmentYear?: AssessmentYear;
  q1CoachName?: string;
  q1Centre?: string;
  q1Level?: string;
  q1Session?: string;
  q1Result: AssessmentResult;
  q2CoachName?: string;
  q2Centre?: string;
  q2Level?: string;
  q2Session?: string;
  q2Result: AssessmentResult;
  quarterDetails?: Partial<Record<AssessmentQuarter, QuarterAssessmentDetails>>;
  flagStatus: FlagStatus;
  actionRequired: ActionRequired;
  interventionRequired: boolean;
  sourceRow?: number;
  originalFlagStatus?: string;
  originalActionRequired?: string;
};

export type QuarterMetrics = {
  totalCount: number;
  assessedCount: number;
  passCount: number;
  failCount: number;
  passRate: number;
};

export type DashboardMetrics = {
  totalUniqueStudents: number;
  quarters: Partial<Record<AssessmentQuarter, QuarterMetrics>>;
  q1: QuarterMetrics;
  q2: QuarterMetrics;
  yellowFlagCount: number;
  redFlagCount: number;
  interventionRequiredCount: number;
};

export type CoachSummary = {
  coachName: string;
  totalStudents: number;
  quarters: Partial<
    Record<
      AssessmentQuarter,
      QuarterMetrics & {
        failRate: number;
      }
    >
  >;
  yellowFlagCount: number;
  redFlagCount: number;
  suggestedAction: "Intervention Review" | "Monitor" | "No immediate concern";
};

export type AssessmentFilters = {
  search: string;
  coach: string;
  centre: string;
  level: string;
  session: string;
  sessionDay: string;
  sessionPeriod: "All" | SessionPeriod;
  flag: "All" | FlagStatus;
  quarter: "All" | AssessmentQuarter;
  result: "All" | AssessmentResult;
};

export type FilterOptions = {
  coaches: string[];
  centres: string[];
  levels: string[];
  sessions: string[];
  sessionDays: string[];
  sessionPeriods: SessionPeriod[];
  quarters: AssessmentQuarter[];
  results: AssessmentResult[];
};

export type QuarterAssessmentRow = {
  id: string;
  studentName: string;
  quarter: AssessmentQuarter;
  coachName: string;
  centre: string;
  level: string;
  session: string;
  result: AssessmentResult;
  flagStatus: FlagStatus;
  actionRequired: ActionRequired;
};

export type QuarterSummary = {
  id: string;
  quarter: AssessmentQuarter;
  session: string;
  centre: string;
  coachName: string;
  totalStudents: number;
  assessedCount: number;
  passCount: number;
  failCount: number;
  passRate: number;
  yellowFlagCount: number;
  redFlagCount: number;
  suggestedAction: "Intervention Review" | "Monitor" | "No immediate concern";
};
