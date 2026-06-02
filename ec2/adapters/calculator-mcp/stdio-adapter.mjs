#!/usr/bin/env node
// Banner-safe launcher for calculator-mcp.
// dist/cli.mjs (a commander action) logs "This server is running on stdio" via
// console.log -> stdout before connecting the stdio transport, which corrupts the
// JSON-RPC stream. Redirect console.log to stderr, then run the CLI exactly as
// the package's own bin/index.js does (`import { run } from '../dist/cli.mjs'`).
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

console.log = console.error;

const here = dirname(fileURLToPath(import.meta.url));
process.chdir(here);

const { run } = await import("./dist/cli.mjs");
run();
