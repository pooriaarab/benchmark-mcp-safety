import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { MAX_TOOL_LOG_ENTRIES, openrouterAdapter, run as runBenchmark, type Benchmark, type Task, type Trace } from "benchmark-core";
import { benchmark, createBenchmark } from "./benchmark.js";
import { scopedTasksPath } from "./api.js";
import { enrichReport } from "./report.js";

const tasksOption = { type: "string", description: "Path to a JSONL task split file; defaults to the packaged public tasks." };
const tools = [
  { name: "list_tasks", description: "List benchmark task ids and prompts.", inputSchema: { type: "object", properties: { tasks: tasksOption }, additionalProperties: false } },
  { name: "get_task", description: "Get one benchmark task.", inputSchema: { type: "object", properties: { taskId: { type: "string" }, tasks: tasksOption }, required: ["taskId"], additionalProperties: false } },
  { name: "score_answer", description: "Score a trace with the deterministic benchmark grader.", inputSchema: { type: "object", properties: { taskId: { type: "string" }, submission: { type: "object" }, seed: { type: "number" }, tasks: tasksOption }, required: ["taskId", "submission"], additionalProperties: false } },
  { name: "run_benchmark", description: "Run every task through an OpenRouter model.", inputSchema: { type: "object", properties: { model: { type: "string" }, tasks: tasksOption }, required: ["model"], additionalProperties: false } },
  { name: "get_provenance", description: "Get benchmark data provenance.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
];

const content = (value: unknown, isError = false) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], ...isError ? { isError: true } : {} });
const args = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const scoped = (input: Record<string, unknown>): Benchmark<Task> => {
  if (typeof input.tasks !== "string") return benchmark;
  const resolved = scopedTasksPath(input.tasks);
  if (!resolved) throw new Error("tasks must name an existing .jsonl file inside the working directory.");
  return createBenchmark(resolved);
};

export function createMcpServer(): Server {
  const server = new Server({ name: benchmark.definition.id, version: benchmark.definition.version }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const input = args(request.params.arguments);
      const active = scoped(input);
      if (request.params.name === "list_tasks") return content({ tasks: await active.listTasks() });
      if (request.params.name === "get_task") {
        if (typeof input.taskId !== "string") return content({ error: "taskId is required." }, true);
        const task = await active.getTask(input.taskId);
        return task ? content({ task }) : content({ error: "Task not found." }, true);
      }
      if (request.params.name === "score_answer") {
        if (typeof input.taskId !== "string" || !input.submission || typeof input.submission !== "object" || Array.isArray(input.submission)) return content({ error: "taskId and submission are required." }, true);
        const submittedLog = Reflect.get(input.submission, "toolLog");
        if (Array.isArray(submittedLog) && submittedLog.length > MAX_TOOL_LOG_ENTRIES) return content({ error: `toolLog may not exceed ${MAX_TOOL_LOG_ENTRIES} entries.` }, true);
        const task = await active.getTask(input.taskId);
        return task ? content({ taskId: task.id, ...await active.score(task, input.submission as Trace, typeof input.seed === "number" ? { seed: input.seed } : {}) }) : content({ error: "Task not found." }, true);
      }
      if (request.params.name === "run_benchmark") {
        if (typeof input.model !== "string") return content({ error: "model is required." }, true);
        if (!process.env.OPENROUTER_API_KEY) return content({ error: "OPENROUTER_API_KEY is required to run a benchmark." }, true);
        return content(await enrichReport(active, await runBenchmark(active, openrouterAdapter({ model: input.model }))));
      }
      if (request.params.name === "get_provenance") return content({ provenance: benchmark.definition.provenance });
      return content({ error: `Unknown tool: ${request.params.name}` }, true);
    } catch (caught) {
      return content({ error: caught instanceof Error ? caught.message : "Unknown error." }, true);
    }
  });
  return server;
}

export const startMcp = () => createMcpServer().connect(new StdioServerTransport());
