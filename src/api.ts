import { createHandler } from "benchmark-core";
import { benchmark, createBenchmark } from "./benchmark.js";

const fallback = createHandler(benchmark);
export const handler = (request: Request): Promise<Response> => {
  const tasksPath = new URL(request.url).searchParams.get("tasks");
  return tasksPath ? createHandler(createBenchmark(tasksPath))(request) : fallback(request);
};
