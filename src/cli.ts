#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import {
  bootstrapCI, createCli, mockAdapter, openaiCompatAdapter, openrouterAdapter,
  renderMarkdown, run as runBenchmark, serve, type ModelAdapter, type RunReport,
} from "benchmark-core";
import { benchmark, setTasksPath } from "./benchmark.js";
import { handler } from "./api.js";
import { startMcp } from "./mcp.js";
import { enrichReport, renderSafetySummary } from "./report.js";

const bin = "benchmark-mcp-safety";
const usage = `Usage: ${bin} <list|show|run|score|card|provenance|index-entry|serve|mcp> [options]`;

function adapter(provider: string, model: string, seed: number): ModelAdapter {
  if (provider === "mock") return mockAdapter({ seed, ...benchmark.definition.mockPolicies ? { policies: benchmark.definition.mockPolicies } : {} });
  if (provider === "openrouter") return openrouterAdapter({ model });
  if (provider === "openai") return openaiCompatAdapter({ model });
  throw new Error("--provider must be openrouter, openai, or mock.");
}

function print(report: RunReport, jsonOutput: boolean) {
  console.log(jsonOutput ? JSON.stringify(report) : `${renderMarkdown(report)}\n${renderSafetySummary(report)}`);
}

async function runCommand(rest: string[], jsonOutput: boolean): Promise<number> {
  const parsed = parseArgs({
    args: rest, strict: true,
    options: {
      model: { type: "string" }, provider: { type: "string" }, concurrency: { type: "string" },
      timeout: { type: "string" }, retries: { type: "string" }, seed: { type: "string" },
      "max-turns": { type: "string" }, "max-tool-calls": { type: "string" }, budget: { type: "string" },
    },
  });
  const { model, provider } = parsed.values;
  if (!model || !provider) { console.error(`run needs --model and --provider.\n${usage}`); return 1; }
  const seed = Number(parsed.values.seed ?? 1);
  const report = await runBenchmark(benchmark, adapter(provider, model, seed), {
    ...parsed.values.concurrency ? { concurrency: Number(parsed.values.concurrency) } : {},
    ...parsed.values.timeout ? { timeoutMs: Number(parsed.values.timeout) } : {},
    ...parsed.values.retries ? { retries: Number(parsed.values.retries) } : {},
    seed,
    ...parsed.values["max-turns"] ? { maxTurns: Number(parsed.values["max-turns"]) } : {},
    ...parsed.values["max-tool-calls"] ? { maxToolCalls: Number(parsed.values["max-tool-calls"]) } : {},
    ...parsed.values.budget ? { budgetUsd: Number(parsed.values.budget) } : {},
  });
  print(await enrichReport(benchmark, report), jsonOutput);
  return report.rows.some((row) => row.error) ? 2 : 0;
}

async function scoreCommand(rest: string[], jsonOutput: boolean): Promise<number> {
  const file = rest[0];
  if (!file) { console.error(`score needs a results JSON file.\n${usage}`); return 1; }
  const original = JSON.parse(await readFile(file, "utf8")) as RunReport;
  if (!Array.isArray(original.rows)) { console.error("File is not a run report."); return 1; }
  const rows = [];
  for (const row of original.rows) {
    const task = await benchmark.getTask(row.taskId);
    if (!task || row.submission === undefined) { console.error(`Cannot score task ${row.taskId}.`); return 1; }
    const grade = await benchmark.score(task, row.submission, { seed: original.seed });
    rows.push({ ...row, score: grade.score, reason: grade.reason });
  }
  const scores = rows.map((row) => row.score);
  const rescored: RunReport = { ...original, rows, mean: scores.reduce((a, b) => a + b, 0) / scores.length, confidenceInterval95: bootstrapCI(scores, original.seed) };
  print(await enrichReport(benchmark, rescored), jsonOutput);
  return 0;
}

async function serveCommand(rest: string[], jsonOutput: boolean): Promise<number> {
  const parsed = parseArgs({ args: rest, options: { host: { type: "string" } }, allowPositionals: true, strict: true });
  if (parsed.positionals.length > 1) { console.error(`serve accepts at most one port.\n${usage}`); return 1; }
  const port = Number(parsed.positionals[0] ?? process.env.PORT ?? 3e3);
  const hostname = parsed.values.host ?? "127.0.0.1";
  if (!Number.isInteger(port) || port < 0 || port > 65535 || !hostname.trim()) { console.error(`serve needs an integer port 0-65535 and a non-empty --host.\n${usage}`); return 1; }
  await serve(handler, { port, hostname });
  console.log(jsonOutput ? JSON.stringify({ listening: port, host: hostname }) : `Listening on http://${hostname}:${port}`);
  return 0;
}

const args = process.argv.slice(2);
const clean: string[] = [];
let tasksPath: string | undefined;
for (let index = 0; index < args.length; index++) {
  const arg = args[index]!;
  if (arg === "--tasks") { tasksPath = args[++index]; continue; }
  if (arg.startsWith("--tasks=")) { tasksPath = arg.slice("--tasks=".length); continue; }
  clean.push(arg);
}
if (args.some((arg) => arg === "--tasks") && !tasksPath) {
  console.error("--tasks needs a JSONL task file path.");
  process.exitCode = 1;
} else {
  if (tasksPath) setTasksPath(tasksPath);
  const command = clean[0];
  const jsonOutput = clean.includes("--json");
  const rest = clean.slice(1).filter((arg) => arg !== "--json");
  try {
    if (command === "run") {
      const providerIndex = rest.indexOf("--provider");
      if ((rest[providerIndex + 1] === "mock" || rest.includes("--provider=mock")) && !rest.some((arg) => arg === "--model" || arg.startsWith("--model="))) rest.push("--model", "offline");
      process.exitCode = await runCommand(rest, jsonOutput);
    } else if (command === "score") {
      process.exitCode = await scoreCommand(rest, jsonOutput);
    } else if (command === "mcp") {
      await startMcp();
      process.exitCode = 0;
    } else if (command === "serve") {
      process.exitCode = await serveCommand(rest, jsonOutput);
    } else {
      process.exitCode = await createCli(benchmark, { bin }).main(clean);
    }
  } catch (caught) {
    console.error(caught instanceof Error ? caught.message : String(caught));
    process.exitCode = 2;
  }
}
