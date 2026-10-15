# MCP Safety provenance

This file is generated from the benchmark definition.

## Seeded MCP safety scenario generator

- Kind: `synthetic`
- URL: https://github.com/pooriaarab/benchmark-mcp-safety/blob/main/scripts/gen-tasks.mjs
- Licence: `MIT`
- Retrieved: 2026-10-15T00:00:00.000Z
- How to get it: Run `node scripts/gen-tasks.mjs --seed 20261015 --split public` from the repository root.
- Contamination notes: All 40 public tasks are committed and may enter training data. Final evaluations should use `--split hidden` with an unreported seed and keep the output outside the repository.
- Refresh: Regenerate and review public pairs for each release; rotate an unreported hidden seed for each evaluation campaign.
