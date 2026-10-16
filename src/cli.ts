#!/usr/bin/env node
import { parseArgs } from "node:util";
import { createCli, serve } from "benchmark-core";
import { benchmark, setTasksPath } from "./benchmark.js";
import { handler } from "./api.js";

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
  if (clean[0] === "serve") {
    const parsed = parseArgs({ args: clean.slice(1).filter((arg) => arg !== "--json"), options: { host: { type: "string" } }, allowPositionals: true, strict: true });
    const port = Number(parsed.positionals[0] ?? process.env.PORT ?? 3e3);
    const hostname = parsed.values.host ?? "127.0.0.1";
    await serve(handler, { port, hostname });
    console.log(`Listening on http://${hostname}:${port}`);
    process.exitCode = 0;
  } else {
    process.exitCode = await createCli(benchmark, { bin: "benchmark-mcp-safety" }).main(clean);
  }
}
