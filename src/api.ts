import { realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { createHandler } from "benchmark-core";
import { benchmark, createBenchmark } from "./benchmark.js";

const fallback = createHandler(benchmark);
export const scopedTasksPath = (value: string): string | undefined => {
  if (!value.endsWith(".jsonl")) return undefined;
  try {
    const root = realpathSync(process.cwd());
    const resolved = realpathSync(resolve(root, value));
    return resolved.startsWith(`${root}${sep}`) ? resolved : undefined;
  } catch {
    return undefined;
  }
};
export const handler = async (request: Request): Promise<Response> => {
  const tasksPath = new URL(request.url).searchParams.get("tasks");
  if (!tasksPath) return fallback(request);
  const resolved = scopedTasksPath(tasksPath);
  if (!resolved) return Response.json({ error: { code: "INVALID_TASKS", message: "tasks must name an existing .jsonl file inside the working directory." } }, { status: 400 });
  return createHandler(createBenchmark(resolved))(request);
};
