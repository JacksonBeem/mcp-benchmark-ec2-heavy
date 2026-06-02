#!/usr/bin/env node
// Vendored stdio adapter for mcp-dnd-5e (corpus addition; mirrors the inline
// start_command but fixes it for the deployed layout).
//
// Why this exists instead of `node dist/server.js`:
//   * dist/server.js reads ./package.json via process.cwd() and resolves
//     @modelcontextprotocol/sdk from its own node_modules, so it must run from
//     this server's own directory -- but the EC2/Lambda wrapper spawns route
//     commands from the repo root. chdir here first so both resolve correctly.
//   * the server writes a startup banner to stdout; redirect console.log to
//     stderr so it never corrupts the stdio JSON-RPC stream.
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
process.chdir(here);
console.log = console.error;

const { createMcpServer } = await import("./dist/server.js");
const { StdioServerTransport } = await import(
  "@modelcontextprotocol/sdk/server/stdio.js"
);

await createMcpServer().connect(new StdioServerTransport());
