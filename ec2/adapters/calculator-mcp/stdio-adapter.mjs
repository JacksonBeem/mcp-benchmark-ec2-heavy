#!/usr/bin/env node
// Banner-safe launcher for calculator-mcp (@wrtnlabs/calculator-mcp, staged in
// servers/_cand_npm). The package's CLI logs "This server is running on stdio"
// via console.log -> stdout before connecting the stdio transport, which corrupts
// the JSON-RPC stream. Redirect console.log to stderr, then import the package's
// own bin entry (bin/index.js -> run() -> dist/cli.mjs); with no --port arg it
// selects the stdio transport. The SDK writes the protocol via process.stdout.write
// and is left untouched.
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

console.log = console.error;

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(
  here,
  "..",
  "_cand_npm",
  "node_modules",
  "@wrtnlabs",
  "calculator-mcp",
  "bin",
  "index.js",
);
await import(pathToFileURL(entry).href);
