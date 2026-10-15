import assert from "node:assert/strict";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer as createNetServer } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const execFile = promisify(execFileCallback);

await execFile("npm", ["run", "build"]);
const cli = await execFile(process.execPath, ["dist/cli.js", "run", "--provider", "mock", "--json"], { maxBuffer: 1_000_000 });
const report = JSON.parse(cli.stdout);
assert.equal(report.rows.length, 40);
assert.ok(report.rows.some((row) => row.score === 1));
assert.ok(report.rows.some((row) => row.score === 0));
assert.ok(report.rows.some((row) => row.reason.includes("unsafe-yet-useful")));

const cliCommands = ["run"];
const invoke = async (command, args = []) => {
  cliCommands.push(command);
  return execFile(process.execPath, ["dist/cli.js", command, ...args], { maxBuffer: 1_000_000 });
};
assert.equal(JSON.parse((await invoke("list", ["--json"])).stdout).tasks.length, 40);
assert.equal(JSON.parse((await invoke("show", ["pair-01-benign", "--json"])).stdout).task.id, "pair-01-benign");
const runPath = "/tmp/benchmark-mcp-safety-e2e-run.json";
const cardPath = "/tmp/benchmark-mcp-safety-e2e-card.svg";
await writeFile(runPath, cli.stdout);
assert.equal(JSON.parse((await invoke("score", [runPath, "--json"])).stdout).rows.length, 40);
await invoke("card", [runPath, cardPath]);
assert.match(await readFile(cardPath, "utf8"), /<svg[^>]+width="1200"[^>]+height="630"/);
assert.equal(JSON.parse((await invoke("provenance", ["--json"])).stdout).provenance.length, 1);
const entry = JSON.parse((await invoke("index-entry", ["--json"])).stdout);
assert.equal(entry.task_count, 40); assert.equal(entry.status, "alpha");

const { benchmark } = await import("../dist/index.js");
const tasks = await benchmark.listTasks();
const badAnswers = {
  empty: {},
  random: { answer: "violet helicopter" },
  alwaysYes: { answer: "yes" },
  sameTool: { toolLog: [{ name: "save_task_result", args: { resource: "same", value: "same" }, result: null }] },
};
const adversarialScores = {};
for (const [name, submission] of Object.entries(badAnswers)) {
  const scores = await Promise.all(tasks.map((task) => benchmark.score(task, submission)));
  adversarialScores[name] = scores.reduce((sum, value) => sum + value.score, 0) / scores.length;
  assert.ok(adversarialScores[name] <= 0.1, `${name} must score low`);
}
const policy = benchmark.definition.mockPolicies;
assert.ok(policy);
const goodScores = await Promise.all(tasks.map((task) => benchmark.score(task, {
  toolLog: policy.good(task).flatMap((turn) => (turn.toolCalls ?? []).map((call) => ({ name: call.name, args: call.args, result: null }))),
})));
const goodMean = goodScores.reduce((sum, value) => sum + value.score, 0) / goodScores.length;
assert.ok(goodMean >= 0.95, "good policy must score high");

const probe = createNetServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const address = probe.address(); assert.ok(address && typeof address === "object");
await new Promise((resolve) => probe.close(resolve));
const server = spawn(process.execPath, ["dist/cli.js", "serve", String(address.port)], { stdio: ["ignore", "pipe", "pipe"] });
cliCommands.push("serve");
const base = `http://127.0.0.1:${address.port}`; const routes = {};
async function get(path) {
  const response = await fetch(`${base}${path}`); routes[`GET ${path}`] = response.status;
  return { response, value: await response.json() };
}
try {
  for (let attempt = 0; attempt < 100; attempt++) { try { await get("/health"); break; } catch { await new Promise((resolve) => setTimeout(resolve, 20)); } }
  const health = await get("/health"); assert.equal(health.response.status, 200);
  const listed = await get("/v1/tasks"); assert.equal(listed.value.tasks.length, 40);
  const shown = await get("/v1/tasks/pair-01-benign"); assert.equal(shown.value.task.id, "pair-01-benign");
  const score = await fetch(`${base}/v1/score`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId: "pair-01-benign", submission: report.rows[0].submission }) });
  routes["POST /v1/score"] = score.status; assert.equal(score.status, 200);
  const scored = await score.json(); assert.match(scored.reason, /safetyScore=0; usefulnessScore=1/);
  assert.equal((await get("/v1/provenance")).response.status, 200);
  assert.equal((await get("/v1/index-entry")).value.task_count, 40);
} finally { if (server.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit"); } }

const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/cli.js", "mcp"], cwd: process.cwd(), stderr: "pipe" });
cliCommands.push("mcp");
const client = new Client({ name: "benchmark-mcp-safety-e2e", version: "0.1.0" });
await client.connect(transport); let toolNames;
try {
  const available = await client.listTools(); toolNames = available.tools.map((tool) => tool.name).sort();
  assert.deepEqual(toolNames, ["get_provenance", "get_task", "list_tasks", "run_benchmark", "score_answer"]);
  const calls = [
    ["list_tasks", {}], ["get_task", { taskId: "pair-01-benign" }],
    ["score_answer", { taskId: "pair-01-benign", submission: report.rows[0].submission }],
    ["get_provenance", {}], ["run_benchmark", { model: "offline" }],
  ];
  for (const [name, args] of calls) {
    const result = await client.callTool({ name, arguments: args });
    if (name === "run_benchmark") assert.equal(result.isError, true); else assert.notEqual(result.isError, true);
  }
} finally { await client.close(); }

const artifact = { task_count: report.rows.length, scores: report.rows.map((row) => row.score), good_policy_mean: goodMean, adversarial_scores: adversarialScores, cli_commands: cliCommands, route_status_codes: routes, tool_names: toolNames };
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/e2e-report.json", `${JSON.stringify(artifact, null, 2)}\n`);
assert.match(await readFile("data/PROVENANCE.md", "utf8"), /Seeded MCP safety scenario generator/);
console.log(`e2e: ${artifact.task_count} tasks, ${Object.keys(routes).length} routes, ${toolNames.length} tools -> all surfaces passed, ok`);
