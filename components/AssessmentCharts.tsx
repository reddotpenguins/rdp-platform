"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { assessmentQuarters, compareAssessmentQuarters } from "@/lib/assessmentLogic";
import {
  studentAssessmentStatuses,
  type StudentAssessmentStatus
} from "@/lib/assessmentStatus";
import type { AssessmentQuarter, CoachSummary, DashboardMetrics } from "@/types/assessment";

type AssessmentChartsProps = {
  coachSummaries: CoachSummary[];
  metrics: DashboardMetrics;
  selectedCoach: string;
  selectedQuarter: "All" | AssessmentQuarter;
  statusCounts: Record<StudentAssessmentStatus, number>;
};

type PassRateDatum = {
  passRate: number;
  quarter: AssessmentQuarter;
};

type FailCoachDatum = {
  failedStudents: number;
  fullCoachName: string;
  "Fail Rate": number;
  rateLabel: string;
  totalStudents: number;
};

type StatusDatum = {
  color: string;
  name: StudentAssessmentStatus;
  value: number;
};

const colors = {
  pass: ["#15803d", "#16a34a", "#86efac", "#bbf7d0"],
  fail: ["#b91c1c", "#dc2626", "#fca5a5", "#fecaca"],
  status: {
    "Due for assessment": "#94a3b8",
    Monitor: "#facc15",
    "On track": "#0ea5e9",
    "Ready to advance": "#22c55e",
    "Require intervention": "#f97316"
  } satisfies Record<StudentAssessmentStatus, string>
};

function percentTick(value: number) {
  return `${value}%`;
}

export function AssessmentCharts({
  coachSummaries,
  metrics,
  selectedCoach,
  selectedQuarter,
  statusCounts
}: AssessmentChartsProps) {
  const displayedQuarters = getDisplayedMetricQuarters(metrics, selectedQuarter);
  const selectedQuarterLabel =
    selectedQuarter === "All" ? displayedQuarters.join(" vs ") : selectedQuarter;
  const passRateData: PassRateDatum[] = displayedQuarters.map((quarter) => {
    const quarterMetrics = getMetricForQuarter(metrics, quarter);

    return { quarter, passRate: Math.round(quarterMetrics.passRate * 100) };
  });
  const statusData: StatusDatum[] = studentAssessmentStatuses
    .map((status) => ({
      color: colors.status[status],
      name: status,
      value: statusCounts[status] ?? 0
    }))
    .filter((status) => status.value > 0);
  const failCoachData = coachSummaries
    .map((summary) => {
      const stats = getSummaryFailStats(summary, selectedQuarter);

      return {
        fullCoachName: summary.coachName,
        "Fail Rate": Math.round(stats.failRate * 100),
        failedStudents: stats.failCount,
        totalStudents: stats.totalCount,
        rateLabel: formatFailRateLabel(stats.failCount, stats.totalCount)
      };
    })
    .filter((summary) => summary.failedStudents > 0)
    .slice()
    .sort(
      (a, b) =>
        b["Fail Rate"] - a["Fail Rate"] || b.failedStudents - a.failedStudents
    )
    .slice(0, selectedCoach === "All" ? 12 : 1);

  return (
    <section className="grid gap-4 xl:grid-cols-3">
      <ChartPanel title={`${selectedQuarterLabel} pass-rate trend`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={passRateData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="quarter" />
            <YAxis tickFormatter={percentTick} domain={[0, 100]} />
            <Tooltip formatter={(value) => `${value}%`} />
            <Bar dataKey="passRate" radius={[4, 4, 0, 0]}>
              {passRateData.map((entry) => (
                <Cell
                  key={`pass-rate-${entry.quarter}`}
                  fill={getQuarterPassColor(entry.quarter)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title="Student status mix">
        {statusData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={statusData} dataKey="value" innerRadius={52} nameKey="name" outerRadius={88}>
                {statusData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <EmptyPanel>No student status data for this filter.</EmptyPanel>
        )}
      </ChartPanel>

      <ChartPanel
        title={
          selectedCoach === "All"
            ? "Coach fail rate (failed / total)"
            : `${selectedCoach} fail rate`
        }
      >
        <FailRateCoachList data={failCoachData} selectedQuarter={selectedQuarter} />
      </ChartPanel>
    </section>
  );
}

function getQuarterPassColor(quarter: AssessmentQuarter) {
  return colors.pass[Math.min(getQuarterShadeIndex(quarter), colors.pass.length - 1)];
}

function getQuarterFailColor(quarter: AssessmentQuarter) {
  return colors.fail[Math.min(getQuarterShadeIndex(quarter), colors.fail.length - 1)];
}

function getSummaryFailStats(summary: CoachSummary, selectedQuarter: "All" | AssessmentQuarter) {
  if (selectedQuarter !== "All") {
    const metrics = summary.quarters[selectedQuarter];

    return {
      failCount: metrics?.failCount ?? 0,
      failRate: metrics?.failRate ?? 0,
      totalCount: metrics?.totalCount ?? 0
    };
  }

  const failCount = Object.values(summary.quarters).reduce(
    (total, metrics) => total + (metrics?.failCount ?? 0),
    0
  );
  const totalCount = Object.values(summary.quarters).reduce(
    (total, metrics) => total + (metrics?.totalCount ?? 0),
    0
  );

  return {
    failCount,
    failRate: totalCount > 0 ? failCount / totalCount : 0,
    totalCount
  };
}

function formatFailRateLabel(failCount: number, totalCount: number) {
  const failRate = totalCount > 0 ? failCount / totalCount : 0;

  return `${Math.round(failRate * 100)}% (${failCount}/${totalCount})`;
}

function getSummaryFailColor(selectedQuarter: "All" | AssessmentQuarter) {
  if (selectedQuarter !== "All") {
    return getQuarterFailColor(selectedQuarter);
  }

  return "#ef4444";
}

function getMetricForQuarter(metrics: DashboardMetrics, quarter: AssessmentQuarter) {
  return (
    metrics.quarters[quarter] ?? {
      assessedCount: 0,
      failCount: 0,
      passCount: 0,
      passRate: 0,
      totalCount: 0
    }
  );
}

function getDisplayedMetricQuarters(
  metrics: DashboardMetrics,
  selectedQuarter: "All" | AssessmentQuarter
) {
  if (selectedQuarter !== "All") {
    return [selectedQuarter];
  }

  const quarters = Object.keys(metrics.quarters).sort(
    (first, second) =>
      compareAssessmentQuarters(first as AssessmentQuarter, second as AssessmentQuarter)
  ) as AssessmentQuarter[];

  return quarters.length > 0 ? quarters : assessmentQuarters;
}

function getQuarterShadeIndex(quarter: AssessmentQuarter) {
  const match = quarter.match(/^Q(\d+)$/);
  return match ? Math.max(Number(match[1]) - 1, 0) : 0;
}

function FailRateCoachList({
  data,
  selectedQuarter
}: {
  data: FailCoachDatum[];
  selectedQuarter: "All" | AssessmentQuarter;
}) {
  if (data.length === 0) {
    return <EmptyPanel>No failed students for this filter.</EmptyPanel>;
  }

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="grid grid-cols-[minmax(7rem,1fr)_minmax(0,1.5fr)_6.75rem] gap-3 border-b border-line pb-2 text-xs font-semibold uppercase text-slate-500">
        <span>Coach</span>
        <span>Fail rate</span>
        <span className="text-right">Rate / count</span>
      </div>
      <div className="mt-2 space-y-2.5">
        {data.map((item) => (
          <div
            className="grid grid-cols-[minmax(7rem,1fr)_minmax(0,1.5fr)_6.75rem] items-center gap-3 text-sm"
            key={item.fullCoachName}
          >
            <span className="truncate font-medium text-ink" title={item.fullCoachName}>
              {item.fullCoachName}
            </span>
            <div
              aria-label={`${item.fullCoachName} fail rate ${item.rateLabel}`}
              className="h-4 overflow-hidden rounded-full bg-slate-100"
              role="img"
            >
              <div
                className="h-full rounded-full"
                style={{
                  backgroundColor: getSummaryFailColor(selectedQuarter),
                  width: `${Math.max(item["Fail Rate"], 3)}%`
                }}
              />
            </div>
            <span className="text-right font-semibold text-slate-700">{item.rateLabel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartPanel({ title, children }: { children: React.ReactNode; title: string }) {
  return (
    <article className="rounded-lg border border-line bg-paper p-4 shadow-panel">
      <h2 className="mb-3 text-base font-semibold text-ink">{title}</h2>
      <div className="h-72 min-w-0">{children}</div>
    </article>
  );
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-line bg-field px-4 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}
