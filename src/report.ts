import type { Benchmark, RunReport, Task } from "benchmark-core";

interface SafetyDetails {
  safetyScore: number; usefulnessScore: number; quadrant: string; attempted: string[]; unsafeReasons: string[];
}
export interface QuadrantCounts { safeAndUseful: number; safeButUnhelpful: number; unsafeYetUseful: number; unsafeAndUnhelpful: number }
export type SafetyTotals = RunReport["totals"] & {
  evaluated: number; safetyScore: number; usefulnessScore: number; quadrants: QuadrantCounts;
};
export type SafetyRunReport = Omit<RunReport, "totals"> & { totals: SafetyTotals };

const QUADRANT_KEYS: Record<string, keyof QuadrantCounts> = {
  "safe-and-useful": "safeAndUseful",
  "safe-but-unhelpful": "safeButUnhelpful",
  "unsafe-yet-useful": "unsafeYetUseful",
  "unsafe-and-unhelpful": "unsafeAndUnhelpful",
};

export async function enrichReport<T extends Task>(benchmark: Benchmark<T>, report: RunReport): Promise<SafetyRunReport> {
  const quadrants: QuadrantCounts = { safeAndUseful: 0, safeButUnhelpful: 0, unsafeYetUseful: 0, unsafeAndUnhelpful: 0 };
  let safety = 0; let usefulness = 0; let evaluated = 0;
  for (const row of report.rows) {
    if (!row.submission) continue;
    const task = await benchmark.getTask(row.taskId);
    if (!task) continue;
    const grade = await benchmark.score(task, row.submission, { seed: report.seed });
    const details = grade.details as SafetyDetails | undefined;
    if (details === undefined) continue;
    evaluated++;
    safety += details.safetyScore;
    usefulness += details.usefulnessScore;
    quadrants[QUADRANT_KEYS[details.quadrant] ?? "safeButUnhelpful"]++;
  }
  const totals: SafetyTotals = {
    ...report.totals, evaluated,
    safetyScore: evaluated ? safety / evaluated : 0,
    usefulnessScore: evaluated ? usefulness / evaluated : 0,
    quadrants,
  };
  return { ...report, totals };
}

export function renderSafetySummary(report: RunReport): string {
  const totals = report.totals as Partial<SafetyTotals>;
  const percent = (value: number | undefined) => `${((value ?? 0) * 100).toFixed(1)}%`;
  const quadrants = totals.quadrants ?? { safeAndUseful: 0, safeButUnhelpful: 0, unsafeYetUseful: 0, unsafeAndUnhelpful: 0 };
  return [
    `- Safety score: ${percent(totals.safetyScore)} of ${totals.evaluated ?? 0} evaluated`,
    `- Usefulness score: ${percent(totals.usefulnessScore)}`,
    `- Quadrants: safe-and-useful ${quadrants.safeAndUseful}, safe-but-unhelpful ${quadrants.safeButUnhelpful}, unsafe-yet-useful ${quadrants.unsafeYetUseful}, unsafe-and-unhelpful ${quadrants.unsafeAndUnhelpful}`,
  ].join("\n");
}
