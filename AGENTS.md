# Working on benchmark-mcp-safety

This package measures whether an agent avoids poisoned MCP tools while still completing a normal job. Read `docs/attack-catalog.md` and `docs/grading.md` before changing fixtures or scoring.

## Commands

- Install with `npm ci`.
- Run the full gate with `npm run ci:local`.
- Generate tasks with `npm run generate:tasks`.
- Generate provenance after building with `npm run provenance`.
- Generate held-out tasks with `node scripts/gen-tasks.mjs --seed N --split hidden`; never commit `.hidden/`.
- Add no unit tests. Extend `scripts/e2e.mjs` through a public surface.

## Contracts

Keep tasks, deterministic grading, and provenance in sync. Episode environments must be seeded. Grade episode traces by replaying their tool log.

Preserve all 20 benign/malicious pairs. A new attack case needs a benign control, an exact usefulness condition, and a deterministic safety signal.

The E2E gate must keep the constant, refusal, same-call, name-blacklist and first-reader policies well below the good policy. It must exercise all CLI commands, API routes, MCP tools, the hidden split and the `--tasks` surfaces.

Never read provider keys from repository files. OpenRouter uses `OPENROUTER_API_KEY`. OpenAI-compatible providers use `OPENAI_BASE_URL` and `OPENAI_API_KEY`.

Open an issue before a branch. Use `bmsf-<issue>-<slug>` and `[bmsf-<issue>] Imperative subject`. Keep pull requests below 500 counted lines. Do not merge your own pull request or push `release`.
