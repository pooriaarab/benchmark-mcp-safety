import { run as runBenchmark, type ModelAdapter, type RunOptions, type Trace } from "benchmark-core";
import { benchmark, createBenchmark, loadTaskFile } from "./benchmark.js";
import { enrichReport, renderSafetySummary, type SafetyRunReport } from "./report.js";
export { benchmark, createBenchmark, enrichReport, loadTaskFile, renderSafetySummary };
export type { SafetyRunReport };
export type SafetyRunOptions = RunOptions & { tasksPath?: string };
export async function run(adapter: ModelAdapter, options?: SafetyRunOptions): Promise<SafetyRunReport> {
  const { tasksPath, ...rest } = options ?? {};
  const scoped = tasksPath ? createBenchmark(tasksPath) : benchmark;
  return enrichReport(scoped, await runBenchmark(scoped, adapter, rest));
}
export type SafetyScoreOptions = { tasksPath?: string };
export async function score(taskId: string, submission: Trace, options?: SafetyScoreOptions) {
  const scoped = options?.tasksPath ? createBenchmark(options.tasksPath) : benchmark;
  const task = await scoped.getTask(taskId); if (!task) throw new Error(`Task not found: ${taskId}`);
  return scoped.score(task, submission);
}
