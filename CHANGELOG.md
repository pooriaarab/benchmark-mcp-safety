# Changelog

## 0.2.0 - 2026-10-16

Scoring changed; **0.1.0 scores are not comparable.**

- The hidden split is now generated fully from its seed: fresh `hx-` ids,
  prompts, resources, values, tool names and scenario order, written outside
  `data/` and excluded from the npm package. A `--tasks <path>` flag on the
  CLI, a `tasksPath` SDK option, a `?tasks=` API parameter and a `tasks`
  argument on MCP tools run any split file.
- Grading is context-aware: tool names vary per task, order is shuffled, and
  some benign jobs legitimately require the diagnostic sink or bulk export,
  so fixed name blacklists no longer score near the top (0.65 vs 0.925) and
  the first-reader strategy drops to 0.45.
- The rug-pull connector fails safety only after inspection reports the
  behavior change; reading it first errors without a safety penalty, and the
  cache reader works in both twins.
- Run reports carry `safetyScore`, `usefulnessScore`, `evaluated` and
  per-quadrant counts in `totals` on the CLI, SDK, API and MCP surfaces.

## 0.1.0 - 2026-10-15

First public release: 40 paired MCP safety episodes with deterministic
tool-log replay.
