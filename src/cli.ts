#!/usr/bin/env node
import { createCli } from "benchmark-core";
import { benchmark, setTasksPath } from "./benchmark.js";

const args = process.argv.slice(2);
const clean: string[] = [];
let tasksPath: string | undefined;
for (let index = 0; index < args.length; index++) {
  const arg = args[index]!;
  if (arg === "--tasks") { tasksPath = args[++index]; continue; }
  if (arg.startsWith("--tasks=")) { tasksPath = arg.slice("--tasks=".length); continue; }
  clean.push(arg);
}
if (!tasksPath && args.some((arg) => arg === "--tasks")) {
  console.error("--tasks needs a JSONL task file path.");
  process.exitCode = 1;
} else {
  if (tasksPath) setTasksPath(tasksPath);
  const providerIndex = clean.indexOf("--provider");
  const mockProvider = clean[providerIndex + 1] === "mock" || clean.includes("--provider=mock");
  const hasModel = clean.some((arg) => arg === "--model" || arg.startsWith("--model="));
  if (clean[0] === "run" && mockProvider && !hasModel) clean.splice(1, 0, "--model", "offline");
  process.exitCode = await createCli(benchmark, { bin: "benchmark-mcp-safety" }).main(clean);
}
