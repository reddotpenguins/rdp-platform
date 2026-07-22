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
import type { AssessmentQuarter, CoachSummary, DashboardMetrics } from "@/types/assessment";

type AssessmentChartsProps = {
  metrics: DashboardMetrics;
  coachSummaries: CoachSummary[];
  selectedQuarter: "All" | AssessmentQuarter;
};

const colors = {
  q1: "#ef562d",
  q2: "#f59e0b",
  pass: "#ef562d",
  fail: "#c2410c",
  none: "#d7bda5",
  yellow: "#f59e0b",
  red: "#c2410c"
};

function percentTick(value: number) {
  return `${value}%`;
}

function chartCoachName(name: string) {
  return name.length > 16 ? `${name.slice(0, 15)}.` : name;
}

export function AssessmentCharts({
  metrics,
  coachSummaries,
  selectedQuarter
}: AssessmentChartsProps) {
  const showQ1 = selectedQuarter === "All" || selectedQuarter === "Q1";
  const showQ2 = selectedQuarter === "All" || selectedQuarter === "Q2";
  const selectedQuarterLabel = selectedQuarter === "All" ? "Q1 vs Q2" : selectedQuarter;
  const passRateData = [
    ...(showQ1 ? [{ quarter: "Q1", passRate: Math.round(metrics.q1.passRate * 100) }] : []),
    ...(showQ2 ? [{ quarter: "Q2", passRate: Math.round(metrics.q2.passRate * 100) }] : [])
  ];

  const passFailData = [
    ...(showQ1 ? [{ quarter: "Q1", Pass: metrics.q1.passCount, Fail: metrics.q1.failCount }] : []),
    ...(showQ2 ? [{ quarter: "Q2", Pass: metrics.q2.passCount, Fail: metrics.q2.failCount }] : [])
  ];

  const flagData = [
    {
      name: "No immediate concern",
      value:
        metrics.totalUniqueStudents - metrics.yellowFlagCount - metrics.redFlagCount > 0
          ? metrics.totalUniqueStudents - metrics.yellowFlagCount - metrics.redFlagCount
          : 0,
      color: colors.none
    },
    { name: "Monitor", value: metrics.yellowFlagCount, color: colors.yellow },
    { name: "Immediate concern", value: metrics.redFlagCount, color: colors.red }
  ];

  const coachChartData = coachSummaries
    .slice()
    .sort((a, b) => b.totalStudents - a.totalStudents)
    .slice(0, 12)
    .map((summary) => {
      const item: Record<string, string | number> = {
        coach: chartCoachName(summary.coachName),
        "Fail Count": getSummaryFailCount(summary, selectedQuarter)
      };

      if (showQ1) {
        item["Q1 Pass Rate"] = Math.round(summary.q1PassRate * 100);
      }

      if (showQ2) {
        item["Q2 Pass Rate"] = Math.round(summary.q2PassRate * 100);
      }

      return item;
    });

  const failCoachData = coachSummaries
    .filter((summary) => getSummaryFailCount(summary, selectedQuarter) > 0)
    .slice()
    .sort(
      (a, b) =>
        getSummaryFailCount(b, selectedQuarter) - getSummaryFailCount(a, selectedQuarter)
    )
    .slice(0, 12)
    .map((summary) => ({
      coach: chartCoachName(summary.coachName),
      Fail: getSummaryFailCount(summary, selectedQuarter)
    }));

  const redFlagCoachData = coachSummaries
    .filter((summary) => summary.redFlagCount > 0)
    .slice()
    .sort((a, b) => b.redFlagCount - a.redFlagCount)
    .slice(0, 12)
    .map((summary) => ({
      coach: chartCoachName(summary.coachName),
      Red: summary.redFlagCount
    }));

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <ChartPanel title={`${selectedQuarterLabel} pass rate`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={passRateData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="quarter" />
            <YAxis tickFormatter={percentTick} domain={[0, 100]} />
            <Tooltip formatter={(value) => `${value}%`} />
            <Bar
              dataKey="passRate"
              fill={selectedQuarter === "Q2" ? colors.q2 : colors.q1}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title={`${selectedQuarterLabel} pass and fail counts`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={passFailData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="quarter" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Pass" fill={colors.pass} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Fail" fill={colors.fail} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title="Concern breakdown">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={flagData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92}>
              {flagData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title={`${selectedQuarterLabel} coach pass rate`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={coachChartData} margin={{ left: 0, right: 8, top: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="coach" angle={-25} textAnchor="end" interval={0} height={62} />
            <YAxis tickFormatter={percentTick} domain={[0, 100]} />
            <Tooltip formatter={(value) => `${value}%`} />
            <Legend />
            {showQ1 ? (
              <Bar dataKey="Q1 Pass Rate" fill={colors.q1} radius={[4, 4, 0, 0]} />
            ) : null}
            {showQ2 ? (
              <Bar dataKey="Q2 Pass Rate" fill={colors.q2} radius={[4, 4, 0, 0]} />
            ) : null}
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title={`${selectedQuarterLabel} fail count by coach`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={failCoachData} margin={{ left: 0, right: 8, top: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="coach" angle={-25} textAnchor="end" interval={0} height={62} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="Fail" fill={colors.fail} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title="Immediate concerns by coach">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={redFlagCoachData} margin={{ left: 0, right: 8, top: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="coach" angle={-25} textAnchor="end" interval={0} height={62} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="Red" fill={colors.red} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>
    </section>
  );
}

function getSummaryFailCount(summary: CoachSummary, selectedQuarter: "All" | AssessmentQuarter) {
  if (selectedQuarter === "Q1") {
    return summary.q1FailCount;
  }

  if (selectedQuarter === "Q2") {
    return summary.q2FailCount;
  }

  return summary.q1FailCount + summary.q2FailCount;
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="rounded-lg border border-line bg-paper p-4 shadow-panel">
      <h2 className="mb-3 text-lg font-semibold text-ink">{title}</h2>
      <div className="h-72 min-w-0">{children}</div>
    </article>
  );
}
