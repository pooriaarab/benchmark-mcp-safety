import { run as runBenchmark, type ModelAdapter, type RunOptions, type Trace } from "benchmark-core";
import { benchmark, createBenchmark, loadTaskFile, setTasksPath } from "./benchmark.js";
export { benchmark, createBenchmark, loadTaskFile, setTasksPath };
export type SafetyRunOptions = RunOptions & { tasksPath?: string };
export const run = (adapter: ModelAdapter, options?: SafetyRunOptions) => {
  const { tasksPath, ...rest } = options ?? {};
  return runBenchmark(tasksPath ? createBenchmark(tasksPath) : benchmark, adapter, rest);
};
export async function score(taskId: string, submission: Trace) {
  const task = await benchmark.getTask(taskId); if (!task) throw new Error(`Task not found: ${taskId}`);
  return benchmark.score(task, submission);
}
