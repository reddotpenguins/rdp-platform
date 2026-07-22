import clsx from "clsx";
import type { QuarterAssessmentRow } from "@/types/assessment";

type QuarterStudentTableProps = {
  rows: QuarterAssessmentRow[];
};

function flagLabel(row: QuarterAssessmentRow) {
  if (row.flagStatus === "Red") {
    return "Intervention Required";
  }

  if (row.flagStatus === "Yellow") {
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

export function QuarterStudentTable({ rows }: QuarterStudentTableProps) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-line bg-paper shadow-panel">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-lg font-semibold text-ink">Quarter assessment rows</h2>
        <p className="text-sm text-slate-500">{rows.length.toLocaleString()} visible rows</p>
      </div>

      <div className="max-h-[620px] w-full overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-paper text-xs uppercase text-slate-500">
            <tr>
              {[
                "Student Name",
                "Quarter",
                "Coach",
                "Centre",
                "Session",
                "Level",
                "Result",
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
            {rows.map((row) => (
              <tr
                key={row.id}
                className={clsx(
                  "align-top transition hover:bg-teal/5",
                  row.flagStatus === "Yellow" && "bg-yellow-50",
                  row.flagStatus === "Red" && "bg-red-50"
                )}
              >
                <td className="border-b border-line px-4 py-3 font-medium text-ink">
                  {row.studentName}
                </td>
                <td className="border-b border-line px-4 py-3">{row.quarter}</td>
                <td className="border-b border-line px-4 py-3">{row.coachName}</td>
                <td className="border-b border-line px-4 py-3">{row.centre}</td>
                <td className="border-b border-line px-4 py-3">{row.session}</td>
                <td className="max-w-72 border-b border-line px-4 py-3">{row.level}</td>
                <td className="border-b border-line px-4 py-3">
                  <span className={resultBadge(row.result)}>{row.result || "Blank"}</span>
                </td>
                <td className="border-b border-line px-4 py-3">
                  <span
                    className={clsx(
                      "inline-flex rounded-md border px-2 py-1 text-xs font-semibold",
                      row.flagStatus === "Red" && "border-red-300 bg-red-100 text-red-700",
                      row.flagStatus === "Yellow" &&
                        "border-amber/40 bg-amber/15 text-yellow-800",
                      row.flagStatus === "None" && "border-slate-200 bg-paper text-slate-600"
                    )}
                  >
                    {flagLabel(row)}
                  </span>
                </td>
                <td className="border-b border-line px-4 py-3 font-medium text-slate-700">
                  {row.actionRequired}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
