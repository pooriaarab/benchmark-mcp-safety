#!/usr/bin/env node
import { createCli } from "benchmark-core";
import { benchmark } from "./benchmark.js";
const args = process.argv.slice(2);
const providerIndex = args.indexOf("--provider");
const mockProvider = args[providerIndex + 1] === "mock" || args.includes("--provider=mock");
const hasModel = args.some((arg) => arg === "--model" || arg.startsWith("--model="));
if (args[0] === "run" && mockProvider && !hasModel) args.splice(1, 0, "--model", "offline");
process.exitCode = await createCli(benchmark, { bin: "benchmark-mcp-safety" }).main(args);
