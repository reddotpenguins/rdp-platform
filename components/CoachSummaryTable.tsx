import clsx from "clsx";
import type { AssessmentQuarter, CoachSummary } from "@/types/assessment";
import { formatPercent } from "@/lib/assessmentLogic";

type CoachSummaryTableProps = {
  summaries: CoachSummary[];
  selectedQuarter: "All" | AssessmentQuarter;
};

export function CoachSummaryTable({ summaries, selectedQuarter }: CoachSummaryTableProps) {
  const showQ1 = selectedQuarter === "All" || selectedQuarter === "Q1";
  const showQ2 = selectedQuarter === "All" || selectedQuarter === "Q2";

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-line bg-paper shadow-panel">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-lg font-semibold text-ink">Coach summary</h2>
        <p className="text-sm text-slate-500">{summaries.length.toLocaleString()} coaches</p>
      </div>

      <div className="w-full overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-paper text-xs uppercase text-slate-500">
            <tr>
              {[
                "Coach name",
                "Total students",
                ...(showQ1 ? ["Q1 assessed", "Q1 pass", "Q1 fail", "Q1 pass rate"] : []),
                ...(showQ2 ? ["Q2 assessed", "Q2 pass", "Q2 fail", "Q2 pass rate"] : []),
                "Monitor",
                "Immediate concern",
                "Suggested action"
              ].map((heading) => (
                <th key={heading} className="border-b border-line px-4 py-3 font-semibold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summaries.map((summary) => (
              <tr key={summary.coachName} className="align-top transition hover:bg-teal/5">
                <td className="border-b border-line px-4 py-3 font-medium text-ink">
                  {summary.coachName}
                </td>
                <td className="border-b border-line px-4 py-3">{summary.totalStudents}</td>
                {showQ1 ? (
                  <>
                    <td className="border-b border-line px-4 py-3">{summary.q1AssessedCount}</td>
                    <td className="border-b border-line px-4 py-3 font-semibold text-green-800">
                      {summary.q1PassCount}
                    </td>
                    <td className="border-b border-line px-4 py-3 font-semibold text-red-800">
                      {summary.q1FailCount}
                    </td>
                    <td className="border-b border-line px-4 py-3">
                      {formatPercent(summary.q1PassRate)}
                    </td>
                  </>
                ) : null}
                {showQ2 ? (
                  <>
                    <td className="border-b border-line px-4 py-3">{summary.q2AssessedCount}</td>
                    <td className="border-b border-line px-4 py-3 font-semibold text-green-600">
                      {summary.q2PassCount}
                    </td>
                    <td className="border-b border-line px-4 py-3 font-semibold text-red-600">
                      {summary.q2FailCount}
                    </td>
                    <td className="border-b border-line px-4 py-3">
                      {formatPercent(summary.q2PassRate)}
                    </td>
                  </>
                ) : null}
                <td className="border-b border-line px-4 py-3 font-semibold text-yellow-800">
                  {summary.yellowFlagCount}
                </td>
                <td className="border-b border-line px-4 py-3 font-semibold text-orange-700">
                  {summary.redFlagCount}
                </td>
                <td className="border-b border-line px-4 py-3">
                  <span
                    className={clsx(
                      "inline-flex rounded-md border px-2 py-1 text-xs font-semibold",
                      summary.suggestedAction === "Intervention Review" &&
                        "border-orange-300 bg-orange-100 text-orange-700",
                      summary.suggestedAction === "Monitor" &&
                        "border-yellow-300 bg-yellow-100 text-yellow-800",
                      summary.suggestedAction === "No immediate concern" &&
                        "border-slate-200 bg-paper text-slate-600"
                    )}
                  >
                    {summary.suggestedAction}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
