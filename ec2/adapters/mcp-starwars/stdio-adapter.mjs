#!/usr/bin/env node
// Banner-safe launcher for mcp-starwars (npm package staged in servers/_cand_npm).
//
// @johnpapa/mcp-starwars's dist/index.js auto-runs main() on import and writes a
// startup banner ("Star Wars MCP Server", "Registered N tools", ...) plus per-tool
// logs via console.log -> stdout, which corrupts the stdio JSON-RPC stream. The
// SDK's StdioServerTransport writes the protocol via process.stdout.write, so
// redirecting console.log to stderr before import keeps stdout protocol-clean
// without suppressing the transport.
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

console.log = console.error;

// Upstream SWAPI (swapi.dev) currently serves an EXPIRED TLS cert, which makes every
// tool return "API Error: certificate has expired". Accept it for THIS child process
// only so the tools return real data. Scoped to the starwars process (read-only public
// API); Node prints an insecure-TLS warning to stderr, which does not corrupt the
// stdio JSON-RPC stream on stdout.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(
  here,
  "..",
  "_cand_npm",
  "node_modules",
  "@johnpapa",
  "mcp-starwars",
  "dist",
  "index.js",
);
await import(pathToFileURL(entry).href);
