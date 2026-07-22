import clsx from "clsx";
import {
  getQuarterCentre,
  getQuarterCoachName,
  getQuarterLevel,
  getQuarterResult,
  getQuarterSession
} from "@/lib/assessmentLogic";
import type { AssessmentQuarter, StudentAssessmentRecord } from "@/types/assessment";

type StudentFlagTableProps = {
  records: StudentAssessmentRecord[];
  selectedQuarter: "All" | AssessmentQuarter;
};

function flagBadge(record: StudentAssessmentRecord) {
  if (record.flagStatus === "Red") {
    return "Intervention Required";
  }

  if (record.flagStatus === "Yellow") {
    return "Monitor";
  }

  return "No immediate concern";
}

function resultBadge(result: string) {
  return clsx(
    "inline-flex min-w-20 justify-center rounded-md border px-2 py-1 text-xs font-semibold",
    result === "Pass" && "border-teal/30 bg-teal/10 text-teal",
    result === "Fail" && "border-coral/30 bg-coral/10 text-coral",
    result === "Absent" && "border-slate-300 bg-slate-100 text-slate-600",
    result === "Not Assessed" && "border-slate-300 bg-slate-100 text-slate-600",
    !result && "border-slate-200 bg-paper text-slate-400"
  );
}

export function StudentFlagTable({ records, selectedQuarter }: StudentFlagTableProps) {
  const showAllQuarters = selectedQuarter === "All";
  const resultHeadings = showAllQuarters
    ? ["Q1 Result", "Q2 Result"]
    : [`${selectedQuarter} Result`];

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-line bg-paper shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Student results</h2>
          <p className="text-sm text-slate-500">{records.length.toLocaleString()} visible rows</p>
        </div>
      </div>

      <div className="max-h-[620px] w-full overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-paper text-xs uppercase text-slate-500">
            <tr>
              {[
                "Student Name",
                "Coach",
                "Centre",
                "Level",
                "Session",
                ...resultHeadings,
                "Concern",
                "Action Required"
              ].map((heading) => (
                <th key={heading} className="border-b border-line px-4 py-3 font-semibold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr
                key={record.id}
                className={clsx(
                  "align-top transition hover:bg-teal/5",
                  record.flagStatus === "Yellow" && "bg-yellow-50",
                  record.flagStatus === "Red" && "bg-red-50"
                )}
              >
                <td className="border-b border-line px-4 py-3 font-medium text-ink">
                  {record.studentName}
                </td>
                <td className="border-b border-line px-4 py-3 text-slate-700">
                  {getDisplayCoach(record, selectedQuarter)}
                </td>
                <td className="border-b border-line px-4 py-3 text-slate-700">
                  {getDisplayCentre(record, selectedQuarter)}
                </td>
                <td className="max-w-72 border-b border-line px-4 py-3 text-slate-700">
                  {getDisplayLevel(record, selectedQuarter)}
                </td>
                <td className="border-b border-line px-4 py-3 text-slate-700">
                  {getDisplaySession(record, selectedQuarter)}
                </td>
                {showAllQuarters ? (
                  <>
                    <td className="border-b border-line px-4 py-3">
                      <span className={resultBadge(record.q1Result)}>
                        {record.q1Result || "Blank"}
                      </span>
                    </td>
                    <td className="border-b border-line px-4 py-3">
                      <span className={resultBadge(record.q2Result)}>
                        {record.q2Result || "Blank"}
                      </span>
                    </td>
                  </>
                ) : (
                  <td className="border-b border-line px-4 py-3">
                    <span className={resultBadge(getQuarterResult(record, selectedQuarter))}>
                      {getQuarterResult(record, selectedQuarter) || "Blank"}
                    </span>
                  </td>
                )}
                <td className="border-b border-line px-4 py-3">
                  <span
                    className={clsx(
                      "inline-flex rounded-md border px-2 py-1 text-xs font-semibold",
                      record.flagStatus === "Red" && "border-red-300 bg-red-100 text-red-700",
                      record.flagStatus === "Yellow" &&
                        "border-amber/40 bg-amber/15 text-yellow-800",
                      record.flagStatus === "None" && "border-slate-200 bg-paper text-slate-600"
                    )}
                  >
                    {flagBadge(record)}
                  </span>
                </td>
                <td className="border-b border-line px-4 py-3 font-medium text-slate-700">
                  {record.actionRequired}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function getDisplayCoach(
  record: StudentAssessmentRecord,
  selectedQuarter: "All" | AssessmentQuarter
) {
  return selectedQuarter === "All" ? record.coachName : getQuarterCoachName(record, selectedQuarter);
}

function getDisplayCentre(
  record: StudentAssessmentRecord,
  selectedQuarter: "All" | AssessmentQuarter
) {
  return selectedQuarter === "All"
    ? record.centre || "-"
    : getQuarterCentre(record, selectedQuarter) || "-";
}

function getDisplayLevel(
  record: StudentAssessmentRecord,
  selectedQuarter: "All" | AssessmentQuarter
) {
  return selectedQuarter === "All"
    ? record.level || "-"
    : getQuarterLevel(record, selectedQuarter) || "-";
}

function getDisplaySession(
  record: StudentAssessmentRecord,
  selectedQuarter: "All" | AssessmentQuarter
) {
  return selectedQuarter === "All"
    ? record.session || "Not provided"
    : getQuarterSession(record, selectedQuarter);
}
